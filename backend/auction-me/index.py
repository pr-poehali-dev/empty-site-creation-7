import json
import os
import hmac
import hashlib
import time
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

    data_check_string = '\n'.join(
        f'{k}={pairs[k]}' for k in sorted(pairs.keys())
    )

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


def resolve_role(cur, telegram_id):
    """Определяет аукционную роль по telegram_chat_id. Владелец всегда admin."""
    cur.execute(
        """SELECT 1
           FROM users
           WHERE role = 'owner' AND telegram_chat_id = %s
           LIMIT 1""",
        (telegram_id,)
    )
    if cur.fetchone():
        return 'admin', None

    cur.execute(
        """SELECT m.auction_role, m.status, m.first_name, m.last_name, r.name
           FROM managers m
           LEFT JOIN roles r ON r.id = m.role_id
           WHERE m.telegram_chat_id = %s
           LIMIT 1""",
        (telegram_id,)
    )
    row = cur.fetchone()
    if not row:
        return 'buyer', None
    auction_role, status, first_name, last_name, role_name = row
    name = ' '.join([p for p in [first_name, last_name] if p]) or None
    if status != 'authorized':
        return 'buyer', name
    if role_name == 'Продавец':
        return 'seller', name
    if auction_role in ('operator', 'admin'):
        return auction_role, name
    return 'buyer', name


def handler(event: dict, context) -> dict:
    """Проверка Telegram-подписи мини-приложения и выдача роли сотрудника/покупателя"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}

    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}

    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Бот не настроен'})}

    body = json.loads(event.get('body') or '{}')
    init_data = body.get('init_data', '')

    ok, user, err = verify_init_data(init_data, bot_token)
    if not ok:
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'role': 'denied', 'error': err})}

    telegram_id = user.get('id')

    conn = get_db()
    cur = conn.cursor()
    role, name = resolve_role(cur, telegram_id)
    cur.close()
    conn.close()

    display_name = name or user.get('first_name') or 'Гость'
    is_staff = role in ('operator', 'admin')

    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({
            'role': role,
            'is_staff': is_staff,
            'name': display_name,
            'telegram_id': telegram_id
        })
    }