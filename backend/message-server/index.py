"""
==============================================================================
СЕРВЕР СООБЩЕНИЙ — КОНТРАКТ ДЛЯ ФУНКЦИЙ (читать перед интеграцией)
==============================================================================

Единый узел отправки уведомлений. Функции НЕ отправляют в Telegram сами —
они кладут задание в этот сервер, а он рассылает с учётом настроек скорости,
повторов, лимитов и отложенного времени.

СКОРОСТЬ: enqueue НЕ рассылает сам (иначе отправитель ждёт и сайт тормозит) —
он лишь кладёт задание и даёт неблокирующий "пинок" на ?action=run, который
запускает рассылку в ОТДЕЛЬНОМ вызове функции. Так отправитель отвечает мгновенно,
а сообщения уходят почти сразу. За ОДИН запуск воркер крутит очередь НЕПРЕРЫВНО
~55 сек (WORKER_MAX_SECONDS) потоком rate_per_second сообщений/сек, пока очередь
не опустеет или не выйдет время. Толкатель (scheduler) раз в минуту зовёт тот же
?action=run — как страховка (отложенные send_after и повторы после сбоя).
Один воркер за раз гарантирует замок в таблице message_worker_lock (TTL 70с).
ВАЖНО: таймаут функции message-server должен быть = 1 минута.

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
   settings/stats/list/retry/cancel — только владелец (по токену).
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
    url = f'https://api.telegram.org/bot{bot_token}/{method}'
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode())
        return bool(res.get('ok')), res.get('description') or 'ok'
    except urllib.error.HTTPError as e:
        try:
            return False, json.loads(e.read().decode()).get('description', f'HTTP {e.code}')
        except Exception:
            return False, f'HTTP {e.code}'
    except Exception as e:
        return False, str(e)


def send_telegram(bot_token, job):
    """Отправляет одно сообщение в Telegram. job — кортеж полей."""
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


WORKER_MAX_SECONDS = 55  # сколько крутить очередь за один запуск (таймаут функции = 60с)
WORKER_LOCK_TTL = 70     # сек: протухший замок (если воркер упал) освобождается сам

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


def try_acquire_worker_lock(cur, conn):
    """Берёт глобальный замок воркера через таблицу (advisory-lock забанен платформой).
    Замок берётся, только если предыдущий протух (старше WORKER_LOCK_TTL) — атомарно.
    True — взяли, можно молотить; False — уже кто-то крутит."""
    cur.execute(
        f"""UPDATE message_worker_lock
           SET locked_at = now()
           WHERE id = 1 AND locked_at < now() - interval '{int(WORKER_LOCK_TTL)} seconds'"""
    )
    got = cur.rowcount > 0
    conn.commit()
    return got


def release_worker_lock(cur, conn):
    # сдвигаем метку в прошлое — замок сразу свободен для следующего воркера
    cur.execute(
        "UPDATE message_worker_lock SET locked_at = now() - interval '1 hour' WHERE id = 1"
    )
    conn.commit()


def run_worker(cur, conn):
    """Рассылает созревшие сообщения потоком ~rate/сек, непрерывно до опустошения очереди
    или лимита времени (WORKER_MAX_SECONDS). Крон будит раз в минуту — проходы стыкуются без простоя."""
    settings = load_settings(cur)
    if not settings['enabled']:
        return {'skipped': 'disabled'}

    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return {'error': 'no_bot_token'}

    # только один воркер за раз: если уже кто-то молотит — выходим, он всё разгребёт
    if not try_acquire_worker_lock(cur, conn):
        return {'skipped': 'busy'}

    rate = max(1, settings['rate_per_second'])
    delay = 1.0 / rate
    per_user_limit = settings['per_user_per_minute']

    worker_start = time.time()
    sent, failed, deferred, processed = 0, 0, 0, 0

    try:
        # Внешний цикл: тянем пачки, пока есть что слать и не вышло время
        while time.time() - worker_start < WORKER_MAX_SECONDS:
            now = now_utc()
            cur.execute(
                """SELECT id, channel, address, text, button_text, button_url, parse_mode,
                          attempts, max_attempts, dedup_key, report_url
                   FROM message_queue
                   WHERE status = 'pending' AND send_after <= %s
                   ORDER BY send_after ASC, id ASC
                   LIMIT 200""",
                (now,)
            )
            rows = cur.fetchall()
            if not rows:
                break  # очередь пуста — не ждём зря
            processed += len(rows)

            batch_done = _process_batch(
                cur, conn, rows, bot_token, settings,
                delay, per_user_limit, worker_start
            )
            sent += batch_done['sent']
            failed += batch_done['failed']
            deferred += batch_done['deferred']
            if batch_done['time_up']:
                break
    finally:
        release_worker_lock(cur, conn)

    return {'sent': sent, 'failed': failed, 'deferred': deferred, 'processed': processed}


def _process_batch(cur, conn, rows, bot_token, settings, delay, per_user_limit, worker_start):
    """Отправляет одну пачку сообщений с паузой delay между отправками. Возвращает счётчики."""
    sent, failed, deferred = 0, 0, 0
    time_up = False

    for r in rows:
        if time.time() - worker_start >= WORKER_MAX_SECONDS:
            time_up = True
            break
        now = now_utc()
        job = {
            'id': r[0], 'channel': r[1], 'address': r[2], 'text': r[3],
            'button_text': r[4], 'button_url': r[5], 'parse_mode': r[6],
            'attempts': r[7], 'max_attempts': r[8], 'dedup_key': r[9], 'report_url': r[10],
        }

        # лимит на одного получателя в минуту
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
                deferred += 1
                continue

        ok, info = send_telegram(bot_token, job)
        attempts = job['attempts'] + 1
        max_att = job['max_attempts'] or settings['max_attempts']

        if ok:
            cur.execute(
                "UPDATE message_queue SET status = 'sent', attempts = %s, sent_at = %s, last_error = NULL WHERE id = %s",
                (attempts, now_utc(), job['id'])
            )
            sent += 1
            final_status = 'sent'
        elif attempts >= max_att:
            cur.execute(
                "UPDATE message_queue SET status = 'error', attempts = %s, last_error = %s WHERE id = %s",
                (attempts, info, job['id'])
            )
            failed += 1
            final_status = 'error'
        else:
            cur.execute(
                "UPDATE message_queue SET attempts = %s, last_error = %s, send_after = %s WHERE id = %s",
                (attempts, info, now_utc() + timedelta(seconds=settings['retry_pause_seconds']), job['id'])
            )
            final_status = None  # ещё будем пробовать

        # отчёт функции (только когда исход окончательный)
        if final_status and job['report_url']:
            delivered = report_result(job['report_url'], {
                'message_id': job['id'],
                'dedup_key': job['dedup_key'],
                'status': final_status,
                'address': job['address'],
                'attempts': attempts,
                'error': None if ok else info,
            })
            if delivered:
                cur.execute("UPDATE message_queue SET reported = true WHERE id = %s", (job['id'],))

        conn.commit()
        time.sleep(delay)

    return {'sent': sent, 'failed': failed, 'deferred': deferred, 'time_up': time_up}


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
                cur.execute("SELECT id, status, attempts, last_error, sent_at FROM message_queue WHERE id = %s", (int(mid),))
            elif dedup:
                cur.execute("SELECT id, status, attempts, last_error, sent_at FROM message_queue WHERE dedup_key = %s", (dedup,))
            else:
                return json_resp(400, {'error': 'message_id или dedup_key обязательны'})
            row = cur.fetchone()
            if not row:
                return json_resp(404, {'error': 'not_found'})
            return json_resp(200, {
                'message_id': row[0], 'status': row[1], 'attempts': row[2],
                'error': row[3], 'sent_at': row[4].isoformat() if row[4] else None,
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
                          send_after, sent_at, source
                    FROM message_queue {where}
                    ORDER BY id DESC LIMIT 50"""
            )
            items = [{
                'id': r[0], 'channel': r[1], 'address': r[2],
                'text': (r[3] or '')[:120], 'status': r[4], 'attempts': r[5],
                'error': r[6],
                'send_after': r[7].isoformat() if r[7] else None,
                'sent_at': r[8].isoformat() if r[8] else None,
                'source': r[9],
            } for r in cur.fetchall()]
            return json_resp(200, {'items': items})

        if action == 'retry':
            mid = body.get('id')
            if mid:
                cur.execute(
                    "UPDATE message_queue SET status = 'pending', attempts = 0, send_after = now(), last_error = NULL WHERE id = %s",
                    (int(mid),)
                )
            else:
                cur.execute(
                    "UPDATE message_queue SET status = 'pending', attempts = 0, send_after = now(), last_error = NULL WHERE status = 'error'"
                )
            conn.commit()
            return json_resp(200, {'success': True})

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