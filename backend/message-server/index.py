"""
==============================================================================
СЕРВЕР СООБЩЕНИЙ — КОНТРАКТ ДЛЯ ФУНКЦИЙ (читать перед интеграцией)
==============================================================================

Единый узел отправки уведомлений. Функции НЕ отправляют в Telegram сами —
они кладут задание в этот сервер, а он рассылает с учётом порядка, повторов,
лимитов и отложенного времени.

ПОРЯДОК (главное): у каждого сообщения свой номер (id, выдаёт база сама при
записи — синхронизация функций не нужна). Воркер шлёт строго по возрастанию
номера, по одному. Одному получателю — строго по очереди (позднее не обгонит
раннее). Разным получателям — можно параллельно: если у одного временный затык,
его хвост откладывается, а сообщения другим уходят.

СКОРОСТЬ: enqueue НЕ рассылает сам (иначе отправитель ждёт и сайт тормозит) —
кладёт задание и даёт неблокирующий "пинок" на ?action=run. Рассылка идёт в
ОТДЕЛЬНОМ вызове. Толкатель (scheduler) раз в минуту зовёт тот же ?action=run —
ТОЛЬКО страховка (отложенные и повторы после сбоя).

ОДИН АКТИВНЫЙ ВОРКЕР ("новый гасит старого"): при старте воркер ставит свой id
владельцем в message_worker_lock.owner. Старый воркер после каждого сообщения
сверяет owner — если сменился, тихо уступает эстафету. Гонок и дублей нет.

ОШИБКИ Telegram (разбор по коду ответа, поле tg_code + текст в last_error):
  - навсегда (403 заблокирован/выгнан/удалён, 400 chat not found) -> сразу error;
  - временно (429 -> ждём retry_after; 5xx/сеть) -> повтор, до 3 попыток -> error.

АВТОЧИСТКА: при каждом запуске воркер раз в сутки удаляет завершённые сообщения
(sent/error/cancelled) старше 14 дней, чтобы очередь не пухла. pending не трогает.
ВАЖНО: таймаут функции message-server = 1 минута (предохранитель HARD_TIME_LIMIT).

URL сервера (из func2url.json): message-server
Все запросы — POST, тело в JSON.

------------------------------------------------------------------------------
1) КАК ПОСТАВИТЬ ЗАДАНИЕ  ->  POST ?action=enqueue
------------------------------------------------------------------------------
Тело запроса:
{
  "address":      "123456789",        # ОБЯЗАТЕЛЬНО. chat_id получателя в Telegram
  "text":         "Текст сообщения",  # ОБЯЗАТЕЛЬНО. Разметка HTML по умолчанию

  # --- всё ниже необязательно ---
  "button_text":  "Открыть лот",      # текст кнопки-ссылки (нужен вместе с button_url)
  "button_url":   "https://...",      # ссылка кнопки
  "parse_mode":   "HTML",             # HTML (по умолчанию) или Markdown
  "send_after":   5,                  # ОТЛОЖКА: число = минут задержки,
                                      #          либо строка ISO "2026-07-05T14:35:00"
  "dedup_key":    "winner_lot_42",    # ЗАЩИТА ОТ ДУБЛЕЙ: если такое уже слали —
                                      #   второй раз не уйдёт (вернётся duplicate=true)
  "report_url":   "https://...",      # куда прислать отчёт о результате (см. п.2)
  "source":       "auction-finalize", # имя функции-отправителя (для монитора)
  "max_attempts": 3                   # переопределить число повторов для этого задания
}

Ответ:
  { "success": true, "message_id": 123 }          # принято
  { "success": true, "duplicate": true }          # уже было (по dedup_key)
  { "error": "address и text обязательны" }        # 400

Пример вызова из Python-функции:
  import json, urllib.request
  def enqueue_message(payload: dict):
      url = FUNC2URL['message-server']  # см. func2url.json
      req = urllib.request.Request(
          url + '?action=enqueue',
          data=json.dumps(payload).encode(),
          headers={'Content-Type': 'application/json'}, method='POST')
      urllib.request.urlopen(req, timeout=10).read()
  # использование:
  enqueue_message({'address': str(chat_id), 'text': 'Привет',
                   'dedup_key': f'hello_{chat_id}', 'source': 'my-func'})

------------------------------------------------------------------------------
2) КАК СЕРВЕР ОТЧИТЫВАЕТСЯ ФУНКЦИИ  ->  POST на указанный вами report_url
------------------------------------------------------------------------------
Если в задании передан "report_url", то ПОСЛЕ окончательного исхода
(успех ИЛИ исчерпаны все повторы) сервер сам присылает на этот адрес POST:
{
  "message_id": 123,
  "dedup_key":  "winner_lot_42",   # или null
  "status":     "sent",            # "sent" — доставлено, "error" — не доставлено
  "address":    "123456789",
  "attempts":   1,
  "error":      null               # текст ошибки, если status = "error"
}
Функция-приёмник должна:
  - принять POST, разобрать тело (json.loads),
  - выполнить свою логику (напр. пометить «не доставлено» при status="error"),
  - ВЕРНУТЬ HTTP 200 (тело не важно). Иначе сервер посчитает отчёт недоставленным.
Промежуточные попытки НЕ отчитываются — только финал.

------------------------------------------------------------------------------
3) КАК СПРОСИТЬ СТАТУС САМОМУ  ->  POST ?action=status
------------------------------------------------------------------------------
Пассивный способ (если report_url не задавали):
  Тело: { "message_id": 123 }   ИЛИ   { "dedup_key": "winner_lot_42" }
  Ответ: { "message_id": 123, "status": "sent|pending|error|cancelled",
           "attempts": 1, "error": null, "sent_at": "..." }

------------------------------------------------------------------------------
СТАТУСЫ ЗАДАНИЯ: pending (ждёт) -> sent (отправлено) | error (не доставлено)
                 | cancelled (отменено владельцем)
СЛУЖЕБНЫЕ РЕЖИМЫ (не для функций): ?action=run (Толкатель, по ключу),
   settings/stats/list/cancel — только владелец (по токену).
==============================================================================
"""
import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
import psycopg2


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_user_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.role FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,)
    )
    return cur.fetchone()


def load_settings(cur):
    cur.execute("SELECT key, value FROM message_settings")
    raw = {r[0]: r[1] for r in cur.fetchall()}
    return {
        'rate_per_second': int(raw.get('rate_per_second', '25') or 25),
        'max_attempts': int(raw.get('max_attempts', '3') or 3),
        'retry_pause_seconds': int(raw.get('retry_pause_seconds', '10') or 10),
        'per_user_per_minute': int(raw.get('per_user_per_minute', '20') or 20),
        'enabled': (raw.get('enabled', 'true') or 'true').lower() == 'true',
    }


def tg_api(bot_token, method, payload):
    """Возвращает (ok, code, reason, retry_after).
    code — HTTP-код ответа Telegram (200 при успехе, 0 при обрыве сети).
    reason — текст причины как есть. retry_after — сек ожидания при 429 (иначе 0)."""
    url = f'https://api.telegram.org/bot{bot_token}/{method}'
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode())
        if res.get('ok'):
            return True, 200, 'ok', 0
        return False, 200, res.get('description') or 'unknown', 0
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
            reason = body.get('description', f'HTTP {e.code}')
            retry_after = int((body.get('parameters') or {}).get('retry_after') or 0)
        except Exception:
            reason, retry_after = f'HTTP {e.code}', 0
        return False, e.code, reason, retry_after
    except Exception as e:
        return False, 0, str(e), 0  # обрыв сети / таймаут — код 0 (временная)


# --- Классификация ответа Telegram: навсегда недоставляемо или временная ошибка ---
def classify_tg(code, reason):
    """Возвращает 'permanent' (повторять бессмысленно) или 'temporary' (повторить)."""
    low = (reason or '').lower()
    # Навсегда: бот заблокирован/выгнан, аккаунт удалён, чат/пользователь не найден
    permanent_markers = (
        'bot was blocked', 'user is deactivated', 'bot was kicked',
        'chat not found', 'user not found', 'peer_id_invalid',
        'bot can\'t initiate', "bot can't initiate", 'have no rights',
        'not enough rights', 'bot is not a member',
    )
    if any(m in low for m in permanent_markers):
        return 'permanent'
    # 403 (доступ запрещён) — почти всегда навсегда
    if code == 403:
        return 'permanent'
    # 400 с "chat not found" уже отловлено выше; прочие 400 — обычно битый payload, тоже навсегда
    if code == 400:
        return 'permanent'
    # 429 (перегрузка), 5xx (сбой Telegram), 0 (сеть) — временные, повторяем
    return 'temporary'


def human_status(status, tg_code, reason, attempts, send_after, now):
    """Понятная расшифровка для монитора очереди по коду ответа Telegram."""
    if status == 'sent':
        return 'Отправлено'
    if status == 'cancelled':
        return 'Отменено'
    if status == 'error':
        low = (reason or '').lower()
        if 'bot was blocked' in low:
            return 'Не доставлено: пользователь заблокировал бота'
        if 'user is deactivated' in low:
            return 'Не доставлено: аккаунт удалён'
        if 'bot was kicked' in low or 'bot is not a member' in low:
            return 'Не доставлено: бот удалён из чата'
        if 'chat not found' in low or 'user not found' in low:
            return 'Не доставлено: чат не найден (пользователь не писал боту)'
        if tg_code and tg_code >= 500:
            return 'Не доставлено: сбой Telegram (исчерпаны попытки)'
        return 'Не доставлено: ' + (reason or 'ошибка')
    # pending
    if send_after and send_after > now:
        return f'Отложено до {send_after.strftime("%H:%M")}'
    if attempts and attempts > 0:
        return f'Повтор (попытка {attempts + 1}): ' + (reason or 'временная ошибка')
    return 'Ждёт отправки'


def send_telegram(bot_token, job):
    """Отправляет одно сообщение. Возвращает (ok, code, reason, retry_after)."""
    payload = {
        'chat_id': job['address'],
        'text': job['text'],
        'parse_mode': job['parse_mode'] or 'HTML',
    }
    if job['button_text'] and job['button_url']:
        payload['reply_markup'] = {
            'inline_keyboard': [[{'text': job['button_text'], 'url': job['button_url']}]]
        }
    return tg_api(bot_token, 'sendMessage', payload)


def report_result(report_url, payload):
    """Активный отчёт функции о результате доставки."""
    try:
        req = urllib.request.Request(
            report_url, data=json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json'}, method='POST'
        )
        urllib.request.urlopen(req, timeout=10).read()
        return True
    except Exception:
        return False


SELF_URL = 'https://functions.poehali.dev/5196ad48-3bd4-4763-bb20-ca8c9b91b508'


def poke_worker():
    """Неблокирующий 'пинок': запускает рассылку в ОТДЕЛЬНОМ вызове функции.
    Ждём ответ лишь долю секунды и отпускаем — воркер стартовал и молотит сам.
    Ошибки/таймаут глушим: задание уже в очереди, крон подстрахует."""
    secret = os.environ.get('SCHEDULER_SECRET', '').strip()
    url = f'{SELF_URL}?action=run'
    if secret:
        url += f'&key={secret}'
    try:
        req = urllib.request.Request(url, data=b'{}',
                                     headers={'Content-Type': 'application/json'}, method='POST')
        urllib.request.urlopen(req, timeout=0.5)
    except Exception:
        pass  # ответа не ждём — воркер уже запущен отдельным вызовом


def claim_worker(cur, conn, worker_id):
    """Новый воркер объявляет себя главным: ставит свой worker_id в замок.
    Старый воркер после каждого сообщения сверяет owner — если там уже НЕ он,
    значит пришёл новый и старый тихо уступает эстафету (без гонок и дублей)."""
    cur.execute(
        "UPDATE message_worker_lock SET owner = %s, locked_at = now() WHERE id = 1",
        (worker_id,)
    )
    conn.commit()


def i_am_still_owner(cur, conn, worker_id):
    """True — я всё ещё главный воркер; False — меня сменил новый, надо уступить."""
    conn.commit()  # свежий снимок (в autocommit-подобном режиме read committed)
    cur.execute("SELECT owner FROM message_worker_lock WHERE id = 1")
    row = cur.fetchone()
    return bool(row) and row[0] == worker_id


HARD_TIME_LIMIT = 50  # предохранитель от таймаута функции (сек); НЕ основной механизм

CLEANUP_KEEP_DAYS = 14      # сколько хранить завершённые сообщения (sent/error/cancelled)
CLEANUP_EVERY_HOURS = 24    # как часто запускать чистку (не чаще раза в сутки)


def maybe_cleanup(cur, conn):
    """Раз в сутки удаляет старые завершённые сообщения (sent/error/cancelled),
    чтобы очередь не пухла бесконечно. Незавершённые (pending) не трогаем.
    Метка последнего прогона — в message_settings, чтобы не чистить каждый вызов."""
    cur.execute("SELECT value FROM message_settings WHERE key = 'last_cleanup_at'")
    row = cur.fetchone()
    if row and row[0]:
        try:
            last = datetime.fromisoformat(row[0])
            if now_utc() - last < timedelta(hours=CLEANUP_EVERY_HOURS):
                return 0  # ещё рано
        except Exception:
            pass
    cur.execute(
        f"""DELETE FROM message_queue
            WHERE status IN ('sent', 'error', 'cancelled')
              AND created_at < now() - interval '{int(CLEANUP_KEEP_DAYS)} days'"""
    )
    removed = cur.rowcount
    cur.execute(
        """INSERT INTO message_settings (key, value, updated_at)
           VALUES ('last_cleanup_at', %s, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
        (now_utc().isoformat(),)
    )
    conn.commit()
    return removed


def run_worker(cur, conn):
    """Один активный воркер шлёт сообщения строго по порядку номера (id), по одному.
    Порядок для одного получателя гарантирован сортировкой по id.
    Разные получатели друг друга не ждут: если у одного временный затык — его
    сообщение откладывается на паузу, а очередь других едет дальше.
    'Новый гасит старого': при старте воркер ставит свой id владельцем; старый,
    увидев смену владельца, сам уступает. Очередь пуста — воркер засыпает."""
    # чистка старых завершённых сообщений (раз в сутки, не зависит от паузы рассылки)
    maybe_cleanup(cur, conn)

    settings = load_settings(cur)
    if not settings['enabled']:
        return {'skipped': 'disabled'}

    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return {'error': 'no_bot_token'}

    # объявляем себя главным — предыдущий воркер после этого уступит
    worker_id = f'{int(time.time()*1000)}-{os.getpid()}'
    claim_worker(cur, conn, worker_id)

    rate = max(1, settings['rate_per_second'])
    delay = 1.0 / rate
    per_user_limit = settings['per_user_per_minute']
    started = time.time()
    sent, failed, deferred = 0, 0, 0

    while True:
        # предохранитель по времени (таймаут функции): просто выходим, крон/пинок продолжат
        if time.time() - started >= HARD_TIME_LIMIT:
            return {'sent': sent, 'failed': failed, 'deferred': deferred, 'stopped': 'time'}

        # если пришёл новый воркер — уступаем эстафету
        if not i_am_still_owner(cur, conn, worker_id):
            return {'sent': sent, 'failed': failed, 'deferred': deferred, 'stopped': 'superseded'}

        now = now_utc()
        # берём САМОЕ РАННЕЕ созревшее сообщение (строгий порядок по номеру id)
        cur.execute(
            """SELECT id, channel, address, text, button_text, button_url, parse_mode,
                      attempts, max_attempts, dedup_key, report_url
               FROM message_queue
               WHERE status = 'pending' AND send_after <= %s
               ORDER BY send_after ASC, id ASC
               LIMIT 1""",
            (now,)
        )
        r = cur.fetchone()
        if not r:
            # очередь пуста — засыпаем, разбудят пинок или крон
            return {'sent': sent, 'failed': failed, 'deferred': deferred, 'stopped': 'empty'}

        job = {
            'id': r[0], 'channel': r[1], 'address': r[2], 'text': r[3],
            'button_text': r[4], 'button_url': r[5], 'parse_mode': r[6],
            'attempts': r[7], 'max_attempts': r[8], 'dedup_key': r[9], 'report_url': r[10],
        }

        # лимит на одного получателя в минуту — откладываем, очередь других едет дальше
        if per_user_limit > 0:
            cur.execute(
                """SELECT COUNT(*) FROM message_queue
                   WHERE address = %s AND status = 'sent' AND sent_at > %s""",
                (job['address'], now - timedelta(minutes=1))
            )
            if cur.fetchone()[0] >= per_user_limit:
                cur.execute(
                    "UPDATE message_queue SET send_after = %s WHERE id = %s",
                    (now + timedelta(minutes=1), job['id'])
                )
                conn.commit()
                deferred += 1
                continue

        ok, code, reason, retry_after = send_telegram(bot_token, job)
        attempts = job['attempts'] + 1
        max_att = job['max_attempts'] or settings['max_attempts']

        if ok:
            cur.execute(
                "UPDATE message_queue SET status = 'sent', attempts = %s, sent_at = %s, tg_code = %s, last_error = NULL WHERE id = %s",
                (attempts, now_utc(), code, job['id'])
            )
            conn.commit()
            sent += 1
            final_status, err = 'sent', None
        else:
            kind = classify_tg(code, reason)
            if kind == 'permanent' or attempts >= max_att:
                # навсегда недоставляемо ИЛИ исчерпаны 3 попытки → error, дальше не пробуем
                cur.execute(
                    "UPDATE message_queue SET status = 'error', attempts = %s, tg_code = %s, last_error = %s WHERE id = %s",
                    (attempts, code, reason, job['id'])
                )
                conn.commit()
                failed += 1
                final_status, err = 'error', reason
            else:
                # временная ошибка: откладываем на паузу (429 — на retry_after),
                # а очередь ДРУГИХ получателей едет дальше — не застреваем на упавшем.
                # ВАЖНО: сдвигаем ВЕСЬ хвост этого получателя, иначе его следующие
                # сообщения (send_after=сейчас) обгонят упавшее и порядок нарушится.
                pause = retry_after if retry_after > 0 else settings['retry_pause_seconds']
                new_after = now_utc() + timedelta(seconds=pause)
                cur.execute(
                    "UPDATE message_queue SET attempts = %s, tg_code = %s, last_error = %s, send_after = %s WHERE id = %s",
                    (attempts, code, reason, new_after, job['id'])
                )
                # хвост того же получателя двигаем не раньше упавшего (сохраняя их порядок по id)
                cur.execute(
                    """UPDATE message_queue SET send_after = %s
                       WHERE status = 'pending' AND address = %s AND id > %s AND send_after < %s""",
                    (new_after, job['address'], job['id'], new_after)
                )
                conn.commit()
                deferred += 1
                final_status, err = None, reason  # ещё будем пробовать

        # отчёт функции — только на окончательном исходе
        if final_status and job['report_url']:
            delivered = report_result(job['report_url'], {
                'message_id': job['id'],
                'dedup_key': job['dedup_key'],
                'status': final_status,
                'address': job['address'],
                'attempts': attempts,
                'error': err,
            })
            if delivered:
                cur.execute("UPDATE message_queue SET reported = true WHERE id = %s", (job['id'],))
                conn.commit()

        time.sleep(delay)


def json_resp(status, data):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(data),
    }


def handler(event: dict, context) -> dict:
    """Сервер сообщений: единый узел отправки уведомлений. enqueue — принять задание, run — разослать (по ключу, зовёт Толкатель), settings/stats/list/retry/cancel — управление для владельца."""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}') if event.get('body') else {}
    action = params.get('action') or body.get('action') or ''

    conn = get_db()
    cur = conn.cursor()
    try:
        # --- Приём задания (внутренний вызов от функций) ---
        if action == 'enqueue':
            address = str(body.get('address') or '').strip()
            text = body.get('text') or ''
            if not address or not text:
                return json_resp(400, {'error': 'address и text обязательны'})
            send_after = body.get('send_after')  # ISO или число минут задержки
            if isinstance(send_after, (int, float)):
                sa = now_utc() + timedelta(minutes=float(send_after))
            elif send_after:
                sa = datetime.fromisoformat(str(send_after).replace('Z', '')).replace(tzinfo=None)
            else:
                sa = now_utc()
            dedup = body.get('dedup_key')
            # защита от дублей
            if dedup:
                cur.execute("SELECT id FROM message_queue WHERE dedup_key = %s", (dedup,))
                if cur.fetchone():
                    return json_resp(200, {'success': True, 'duplicate': True})
            cur.execute(
                """INSERT INTO message_queue
                     (channel, address, text, button_text, button_url, parse_mode,
                      send_after, dedup_key, report_url, max_attempts, source)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (
                    body.get('channel') or 'telegram', address, text,
                    body.get('button_text'), body.get('button_url'),
                    body.get('parse_mode') or 'HTML', sa, dedup,
                    body.get('report_url'), body.get('max_attempts'),
                    body.get('source'),
                )
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            # НЕ рассылаем здесь (иначе отправитель ждёт до 55 сек и сайт тормозит).
            # Даём серверу отдельный неблокирующий "пинок" на ?action=run —
            # рассылка пойдёт в ОТДЕЛЬНОМ вызове, а этот запрос вернётся мгновенно.
            # Отложенные (send_after в будущем) пинать незачем — их подберёт крон.
            if sa <= now_utc():
                poke_worker()
            return json_resp(200, {'success': True, 'message_id': new_id})

        # --- Воркер: рассылка (зовёт Толкатель по ключу) ---
        if action == 'run':
            secret = os.environ.get('SCHEDULER_SECRET', '').strip()
            given = (params.get('key') or body.get('key') or '').strip()
            if secret and given != secret:
                return json_resp(403, {'error': 'forbidden'})
            result = run_worker(cur, conn)
            conn.commit()
            return json_resp(200, result)

        # --- Спросить статус своего задания (пассивный отчёт) ---
        if action == 'status':
            mid = body.get('message_id') or params.get('message_id')
            dedup = body.get('dedup_key') or params.get('dedup_key')
            if mid:
                cur.execute("SELECT id, status, attempts, last_error, sent_at, tg_code FROM message_queue WHERE id = %s", (int(mid),))
            elif dedup:
                cur.execute("SELECT id, status, attempts, last_error, sent_at, tg_code FROM message_queue WHERE dedup_key = %s", (dedup,))
            else:
                return json_resp(400, {'error': 'message_id или dedup_key обязательны'})
            row = cur.fetchone()
            if not row:
                return json_resp(404, {'error': 'not_found'})
            return json_resp(200, {
                'message_id': row[0], 'status': row[1], 'attempts': row[2],
                'error': row[3], 'sent_at': row[4].isoformat() if row[4] else None,
                'tg_code': row[5],
            })

        # --- Всё остальное только для владельца ---
        req_headers = event.get('headers', {})
        auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        user = get_user_by_token(cur, token)
        if not user:
            return json_resp(401, {'error': 'Не авторизован'})
        if user[1] != 'owner':
            return json_resp(403, {'error': 'Только владелец'})

        if action == 'settings' and method == 'GET':
            return json_resp(200, load_settings(cur))

        if action == 'settings' and method in ('PUT', 'POST'):
            allowed = {'rate_per_second', 'max_attempts', 'retry_pause_seconds', 'per_user_per_minute', 'enabled'}
            for key, value in (body.get('settings') or {}).items():
                if key not in allowed:
                    continue
                val = str(value).lower() if isinstance(value, bool) else str(value)
                cur.execute(
                    """INSERT INTO message_settings (key, value, updated_at)
                       VALUES (%s, %s, now())
                       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
                    (key, val)
                )
            conn.commit()
            return json_resp(200, load_settings(cur))

        if action == 'stats':
            cur.execute(
                """SELECT
                     COUNT(*) FILTER (WHERE status = 'pending' AND send_after <= now()) AS ready,
                     COUNT(*) FILTER (WHERE status = 'pending' AND send_after > now()) AS deferred,
                     COUNT(*) FILTER (WHERE status = 'error') AS errors,
                     COUNT(*) FILTER (WHERE status = 'sent') AS sent
                   FROM message_queue"""
            )
            s = cur.fetchone()
            return json_resp(200, {'ready': s[0], 'deferred': s[1], 'errors': s[2], 'sent': s[3]})

        if action == 'list':
            status_filter = params.get('status') or body.get('status') or 'all'
            where = "" if status_filter == 'all' else f"WHERE status = '{status_filter.replace(chr(39), '')}'"
            cur.execute(
                f"""SELECT id, channel, address, text, status, attempts, last_error,
                          send_after, sent_at, source, tg_code
                    FROM message_queue {where}
                    ORDER BY id DESC LIMIT 50"""
            )
            now = now_utc()
            items = [{
                'id': r[0], 'channel': r[1], 'address': r[2],
                'text': (r[3] or '')[:120], 'status': r[4], 'attempts': r[5],
                'error': r[6],
                'send_after': r[7].isoformat() if r[7] else None,
                'sent_at': r[8].isoformat() if r[8] else None,
                'source': r[9],
                'tg_code': r[10],
                'status_text': human_status(r[4], r[10], r[6], r[5], r[7], now),
            } for r in cur.fetchall()]
            return json_resp(200, {'items': items})

        if action == 'cancel':
            mid = body.get('id')
            if not mid:
                return json_resp(400, {'error': 'id обязателен'})
            cur.execute("UPDATE message_queue SET status = 'cancelled' WHERE id = %s AND status = 'pending'", (int(mid),))
            conn.commit()
            return json_resp(200, {'success': True})

        return json_resp(400, {'error': 'Неизвестное действие'})
    finally:
        cur.close()
        conn.close()