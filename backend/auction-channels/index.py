import json
import os
import hmac
import hashlib
import time
import urllib.request
import urllib.error
from urllib.parse import parse_qsl
import psycopg2


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


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


def resolve_manager(cur, telegram_id):
    """Возвращает (manager_id, auction_role) или (None, None)."""
    cur.execute(
        """SELECT id, auction_role, status FROM managers
           WHERE telegram_chat_id = %s LIMIT 1""",
        (telegram_id,)
    )
    row = cur.fetchone()
    if not row:
        return None, None
    manager_id, auction_role, status = row
    if status != 'authorized' or auction_role not in ('operator', 'admin'):
        return None, None
    return manager_id, auction_role


def tg_api(bot_token, method, payload):
    """Вызов Telegram Bot API. Возвращает (ok, result_or_error)."""
    url = f'https://api.telegram.org/bot{bot_token}/{method}'
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode())
        if res.get('ok'):
            return True, res.get('result')
        return False, res.get('description', 'Ошибка Telegram')
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode())
            return False, err.get('description', f'HTTP {e.code}')
        except Exception:
            return False, f'HTTP {e.code}'
    except Exception as e:
        return False, str(e)


def handler(event: dict, context) -> dict:
    """Управление Telegram-каналами аукциона: подключение, список, удаление"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    method = event.get('httpMethod', 'GET')

    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Бот не настроен'})}

    body = json.loads(event.get('body') or '{}')
    init_data = body.get('init_data', '')
    if not init_data:
        params = event.get('queryStringParameters') or {}
        init_data = params.get('init_data', '')

    ok, user, err = verify_init_data(init_data, bot_token)
    if not ok:
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}

    conn = get_db()
    cur = conn.cursor()
    manager_id, auction_role = resolve_manager(cur, user.get('id'))
    if not manager_id:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет доступа'})}

    if method == 'GET':
        cur.execute(
            """SELECT id, chat_id, title, username, created_at
               FROM auction_channels ORDER BY created_at DESC"""
        )
        channels = [{
            'id': r[0],
            'chat_id': r[1],
            'title': r[2],
            'username': r[3],
            'created_at': r[4].isoformat() if r[4] else None,
        } for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'channels': channels})}

    if method == 'POST':
        action = body.get('action', 'add')

        if action == 'discover':
            cur.execute(
                """SELECT d.chat_id, d.title, d.username
                   FROM auction_discovered_channels d
                   WHERE d.is_admin = TRUE
                     AND d.chat_id NOT IN (SELECT chat_id FROM auction_channels)
                   ORDER BY d.updated_at DESC"""
            )
            found = [{
                'chat_id': r[0],
                'title': r[1],
                'username': r[2],
            } for r in cur.fetchall()]
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'discovered': found})}

        if action == 'add_discovered':
            chat_id = body.get('chat_id')
            if chat_id is None:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите канал'})}
            cur.execute(
                "SELECT title, username, is_admin FROM auction_discovered_channels WHERE chat_id = %s",
                (chat_id,)
            )
            d = cur.fetchone()
            if not d or not d[2]:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Бот больше не администратор этого канала'})}
            try:
                cur.execute(
                    """INSERT INTO auction_channels (id, chat_id, title, username, added_by)
                       VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM auction_channels), %s, %s, %s, %s)
                       ON CONFLICT (chat_id) DO UPDATE SET title = EXCLUDED.title, username = EXCLUDED.username
                       RETURNING id""",
                    (chat_id, d[0], d[1], manager_id)
                )
                channel_id = cur.fetchone()[0]
                conn.commit()
            except Exception as e:
                conn.rollback()
                diag = {}
                try:
                    cur.execute("SELECT current_user, current_schema")
                    who = cur.fetchone()
                    diag = {'current_user': who[0], 'current_schema': who[1]}
                except Exception:
                    pass
                cur.close(); conn.close()
                return {'statusCode': 500, 'headers': headers, 'body': json.dumps({
                    'error': 'DEBUG insert failed', 'detail': str(e), 'diag': diag,
                })}
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'id': channel_id, 'chat_id': chat_id, 'title': d[0], 'username': d[1],
            })}

        if action == 'add':
            raw = (body.get('channel') or '').strip()
            if not raw:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите канал'})}
            chat_ref = raw
            if not raw.lstrip('-').isdigit():
                chat_ref = '@' + raw.lstrip('@')

            ok_chat, chat = tg_api(bot_token, 'getChat', {'chat_id': chat_ref})
            if not ok_chat:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': f'Канал не найден: {chat}'})}

            bot_ok, bot_id = tg_api(bot_token, 'getMe', {})
            member_ok, member = tg_api(bot_token, 'getChatMember', {
                'chat_id': chat['id'],
                'user_id': bot_id['id'] if bot_ok else 0,
            })
            if not member_ok or member.get('status') not in ('administrator', 'creator'):
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Добавьте бота администратором канала'})}

            cur.execute(
                """INSERT INTO auction_channels (id, chat_id, title, username, added_by)
                   VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM auction_channels), %s, %s, %s, %s)
                   ON CONFLICT (chat_id) DO UPDATE SET title = EXCLUDED.title, username = EXCLUDED.username
                   RETURNING id""",
                (chat['id'], chat.get('title'), chat.get('username'), manager_id)
            )
            channel_id = cur.fetchone()[0]
            conn.commit()
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'id': channel_id,
                'chat_id': chat['id'],
                'title': chat.get('title'),
                'username': chat.get('username'),
            })}

        if action == 'remove':
            channel_id = body.get('channel_id')
            if not channel_id:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите канал'})}
            cur.execute("UPDATE auction_lot_posts SET status = 'removed' WHERE channel_id = %s", (channel_id,))
            cur.execute("DELETE FROM auction_channels WHERE id = %s", (channel_id,))
            conn.commit()
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Неизвестное действие'})}

    cur.close(); conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}