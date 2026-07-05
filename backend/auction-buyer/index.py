import json
import os
import hmac
import hashlib
import time
import socket
import urllib.request
import urllib.error
from urllib.parse import parse_qsl
from datetime import datetime, timezone
import psycopg2


# --- Форсируем IPv4 для исходящих соединений ---
# В окружении облачной функции попытка соединения по IPv6 к api.telegram.org
# зависает до таймаута (нет рабочего IPv6-маршрута). Оставляем только IPv4.
_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_only_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


socket.getaddrinfo = _ipv4_only_getaddrinfo


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def esc(text):
    if text is None:
        return ''
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def tg_api(bot_token, method, payload, retries=3):
    """Вызов Telegram Bot API с повторами при сетевом таймауте."""
    url = f'https://api.telegram.org/bot{bot_token}/{method}'
    data = json.dumps(payload).encode()
    last_err = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                res = json.loads(resp.read().decode())
            print(f'[tg_api] {method} attempt={attempt} took={time.time()-t0:.2f}s ok={res.get("ok")}')
            return bool(res.get('ok')), res.get('result') or res.get('description')
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read().decode())
                return False, err.get('description', f'HTTP {e.code}')
            except Exception:
                return False, f'HTTP {e.code}'
        except Exception as e:
            last_err = str(e)
            print(f'[tg_api] {method} attempt={attempt} took={time.time()-t0:.2f}s FAIL err={last_err}')
            time.sleep(0.5)
    return False, last_err


def lot_app_url(bot_token, lot_id):
    uname = os.environ.get('TELEGRAM_BOT_USERNAME', '').strip().lstrip('@')
    if not uname:
        ok, me = tg_api(bot_token, 'getMe', {})
        uname = me.get('username') if ok and isinstance(me, dict) else None
    if uname:
        return f'https://t.me/{uname}?startapp=lot_{lot_id}'
    return 'https://t.me'


def notify_bid(bot_token, telegram_id, lot_id, title, text):
    """Личное сообщение покупателю о ставке с кнопкой перехода в лот."""
    try:
        url = lot_app_url(bot_token, lot_id)
        ok, res = tg_api(bot_token, 'sendMessage', {
            'chat_id': telegram_id,
            'text': text,
            'parse_mode': 'HTML',
            'reply_markup': {'inline_keyboard': [[{'text': 'Перейти в лот', 'url': url}]]},
        })
        print(f'[notify_bid] chat_id={telegram_id} lot={lot_id} ok={ok} res={res}')
    except Exception as e:
        print(f'[notify_bid] EXCEPTION chat_id={telegram_id} lot={lot_id} err={e}')


def verify_init_data(init_data: str, bot_token: str, max_age: int = 86400):
    """Проверяет подпись Telegram WebApp initData. Возвращает (ok, user_dict, error)."""
    if not init_data:
        return False, None, 'Нет данных Telegram'
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        return False, None, 'Некорректные данные'

    received_hash = pairs.pop('hash', None)
    if not received_hash:
        return False, None, 'Нет подписи'

    data_check_string = '\n'.join(f'{k}={pairs[k]}' for k in sorted(pairs.keys()))
    secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc_hash, received_hash):
        return False, None, 'Подпись недействительна'

    auth_date = pairs.get('auth_date')
    if auth_date and auth_date.isdigit():
        if time.time() - int(auth_date) > max_age:
            return False, None, 'Данные устарели'

    user_raw = pairs.get('user')
    if not user_raw:
        return False, None, 'Нет пользователя'
    try:
        user = json.loads(user_raw)
    except Exception:
        return False, None, 'Некорректный пользователь'
    return True, user, None


def lot_is_open(status, ends_at):
    """Лот принимает ставки, если активен и время не вышло."""
    if status != 'active':
        return False
    if ends_at is not None and ends_at <= datetime.now(timezone.utc).replace(tzinfo=None):
        return False
    return True


def fetch_lot(cur, lot_id, telegram_id):
    cur.execute(
        """SELECT id, title, description, desired_price, quantity, quantity_left,
                  status, ends_at, photo_urls
           FROM auction_lots WHERE id = %s""",
        (lot_id,)
    )
    r = cur.fetchone()
    if not r:
        return None
    cur.execute(
        "SELECT price FROM auction_bids WHERE lot_id = %s AND telegram_id = %s",
        (lot_id, telegram_id)
    )
    b = cur.fetchone()
    status = r[6]
    is_open = lot_is_open(status, r[7])
    ended = (not is_open) and status == 'active'

    win = None
    cur.execute(
        """SELECT status, price, position, pay_deadline
           FROM auction_winners WHERE lot_id = %s AND telegram_id = %s""",
        (lot_id, telegram_id)
    )
    wr = cur.fetchone()
    if wr:
        win = {
            'status': wr[0],
            'price': float(wr[1]),
            'position': wr[2],
            'pay_deadline': wr[3].isoformat() if wr[3] else None,
        }

    return {
        'id': r[0], 'title': r[1], 'description': r[2],
        'desired_price': float(r[3]), 'quantity': r[4], 'quantity_left': r[5],
        'status': status, 'ends_at': r[7].isoformat() if r[7] else None,
        'photo_urls': r[8] or [],
        'open': is_open,
        'ended': ended,
        'my_bid': float(b[0]) if b else None,
        'win': win,
    }


def upsert_bid(cur, lot_id, telegram_id, username, display_name, price):
    """Создаёт или обновляет ставку. Возвращает True, если ставка уже была (изменение)."""
    cur.execute(
        "SELECT 1 FROM auction_bids WHERE lot_id = %s AND telegram_id = %s",
        (lot_id, telegram_id)
    )
    existed = cur.fetchone() is not None
    cur.execute(
        """INSERT INTO auction_bids (lot_id, telegram_id, username, display_name, price)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (lot_id, telegram_id)
           DO UPDATE SET price = EXCLUDED.price,
                         username = EXCLUDED.username,
                         display_name = EXCLUDED.display_name,
                         updated_at = NOW()""",
        (lot_id, telegram_id, username, display_name, price)
    )
    return existed


def handler(event: dict, context) -> dict:
    """Мини-приложение покупателя: просмотр лота, ставки, забрать по цене, мои лоты"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Бот не настроен'})}

    method = event.get('httpMethod')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')
    init_data = body.get('init_data') or params.get('init_data') or ''

    ok, user, err = verify_init_data(init_data, bot_token)
    if not ok:
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}

    telegram_id = user.get('id')
    username = user.get('username')
    display_name = ' '.join([p for p in [user.get('first_name'), user.get('last_name')] if p]) or username

    conn = get_db()
    cur = conn.cursor()

    if method == 'GET':
        action = params.get('action', 'get_lot')
        if action == 'my_bids':
            cur.execute(
                """SELECT l.id, l.title, l.desired_price, l.status, l.ends_at,
                          l.photo_urls, b.price
                   FROM auction_bids b
                   JOIN auction_lots l ON l.id = b.lot_id
                   WHERE b.telegram_id = %s
                   ORDER BY b.updated_at DESC""",
                (telegram_id,)
            )
            lots = [{
                'id': r[0], 'title': r[1], 'desired_price': float(r[2]),
                'status': r[3], 'ends_at': r[4].isoformat() if r[4] else None,
                'photo_urls': r[5] or [], 'my_bid': float(r[6]),
            } for r in cur.fetchall()]
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'lots': lots})}

        lot_id = params.get('lot_id')
        if not lot_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан лот'})}
        lot = fetch_lot(cur, lot_id, telegram_id)
        cur.close(); conn.close()
        if not lot:
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Лот не найден'})}
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'lot': lot})}

    if method == 'POST':
        action = body.get('action')
        lot_id = body.get('lot_id')
        if not lot_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан лот'})}

        if action in ('pay', 'forfeit'):
            cur.execute(
                """SELECT id, status, pay_deadline FROM auction_winners
                   WHERE lot_id = %s AND telegram_id = %s""",
                (lot_id, telegram_id)
            )
            wr = cur.fetchone()
            if not wr or wr[1] != 'awaiting_payment':
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нет активного выигрыша по этому лоту'})}
            win_id = wr[0]
            if action == 'pay':
                cur.execute("UPDATE auction_winners SET status = 'paid' WHERE id = %s", (win_id,))
                cur.execute(
                    """INSERT INTO auction_payments (lot_id, winner_id, telegram_id, status, paid_at)
                       VALUES (%s, %s, %s, 'confirmed', now())""",
                    (lot_id, win_id, telegram_id)
                )
            else:
                # отказ = как истёкшая оплата: крон поднимет следующего из резерва
                cur.execute(
                    "UPDATE auction_winners SET status = 'awaiting_payment', pay_deadline = now() - interval '1 minute' WHERE id = %s",
                    (win_id,)
                )
            conn.commit()
            lot = fetch_lot(cur, lot_id, telegram_id)
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'lot': lot})}

        cur.execute(
            "SELECT desired_price, status, ends_at, title FROM auction_lots WHERE id = %s",
            (lot_id,)
        )
        lr = cur.fetchone()
        if not lr:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Лот не найден'})}
        desired_price, status, ends_at, title = float(lr[0]), lr[1], lr[2], lr[3]

        if not lot_is_open(status, ends_at):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Аукцион завершён'})}

        if action == 'cancel_bid':
            cur.execute(
                "DELETE FROM auction_bids WHERE lot_id = %s AND telegram_id = %s",
                (lot_id, telegram_id)
            )
            removed = cur.rowcount
            conn.commit()
            cur.close(); conn.close()
            if removed:
                notify_bid(
                    bot_token, telegram_id, lot_id, title,
                    f"❌ Вы сняли ставку в лоте <b>№{lot_id}</b> «{esc(title)}»."
                )
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'cancelled': bool(removed)})}

        if action == 'buy_now':
            price = desired_price
        elif action == 'place_bid':
            try:
                price = float(body.get('price'))
            except (TypeError, ValueError):
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Некорректная цена'})}
            if price <= 0:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Цена должна быть больше нуля'})}
            if price > desired_price:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Цена не может быть выше начальной'})}
        else:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Неизвестное действие'})}

        existed = upsert_bid(cur, lot_id, telegram_id, username, display_name, price)
        conn.commit()
        print(f'[bid] saved lot={lot_id} tg={telegram_id} price={price} existed={existed}')
        lot = fetch_lot(cur, lot_id, telegram_id)
        cur.close(); conn.close()

        price_str = f"{int(price)} ₽"
        if existed:
            text = f"✏️ Вы изменили ставку в лоте <b>№{lot_id}</b> «{esc(title)}» на <b>{price_str}</b>."
        else:
            text = f"✅ Вы сделали ставку в лоте <b>№{lot_id}</b> «{esc(title)}» — <b>{price_str}</b>."
        notify_bid(bot_token, telegram_id, lot_id, title, text)

        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'lot': lot})}

    cur.close(); conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}