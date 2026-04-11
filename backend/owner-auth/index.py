import json
import os
import secrets
import urllib.request
from datetime import datetime, timedelta
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def check_access(cur, phone):
    cur.execute("SELECT id, role, telegram_chat_id FROM users WHERE phone = %s", (phone,))
    user = cur.fetchone()
    if not user:
        return None, None, None

    if user[1] == 'owner':
        return 'owner', user, None

    cur.execute("SELECT id, status FROM managers WHERE phone = %s", (phone,))
    mgr = cur.fetchone()
    if not mgr:
        return 'denied', user, 'Доступ запрещён. Обратитесь к владельцу.'

    if mgr[1] == 'not_authorized':
        return 'not_authorized', user, 'Привяжите Telegram для продолжения.'

    if mgr[1] == 'pending':
        return 'pending', user, 'Ваш аккаунт ожидает авторизации владельцем.'

    if mgr[1] == 'authorized':
        return 'authorized', user, None

    return 'denied', user, 'Доступ запрещён.'

def handler(event: dict, context) -> dict:
    """Авторизация по номеру телефона: отправка кода в Telegram и проверка"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    body = json.loads(event.get('body') or '{}')

    if method == 'POST' and action == 'check_phone':
        phone = body.get('phone', '').strip()
        if not phone:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите номер телефона'})}

        conn = get_db()
        cur = conn.cursor()
        status, user, message = check_access(cur, phone)
        cur.close()
        conn.close()

        if status is None:
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'allowed': False, 'status': 'denied', 'error': 'Доступ запрещён. Обратитесь к владельцу.'})}

        if status == 'denied':
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'allowed': False, 'status': 'denied', 'error': message})}

        if status == 'not_authorized':
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'allowed': True, 'status': 'not_authorized', 'need_telegram': True})}

        if status == 'pending':
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'allowed': False, 'status': 'pending', 'error': message})}

        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'allowed': True, 'status': status, 'need_telegram': user[2] is None})}

    if method == 'POST' and action == 'send_code':
        phone = body.get('phone', '').strip()
        if not phone:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите номер телефона'})}

        conn = get_db()
        cur = conn.cursor()

        status, user, message = check_access(cur, phone)
        if status not in ('owner', 'authorized'):
            cur.close()
            conn.close()
            if status == 'pending':
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Ваш аккаунт ожидает авторизации владельцем.'})}
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': message or 'Доступ запрещён'})}

        if not user[2]:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Telegram не привязан. Нажмите кнопку "Привет Telegram" для привязки'})}

        code = str(secrets.randbelow(900000) + 100000)
        expires_at = datetime.now() + timedelta(minutes=5)

        cur.execute("DELETE FROM login_codes WHERE phone = %s", (phone,))
        cur.execute(
            "INSERT INTO login_codes (phone, code, expires_at) VALUES (%s, %s, %s)",
            (phone, code, expires_at)
        )
        conn.commit()

        bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
        if bot_token:
            url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
            payload = json.dumps({
                'chat_id': user[2],
                'text': f'Ваш код авторизации: {code}\n\nКод действителен 5 минут.',
                'parse_mode': 'HTML'
            }).encode()
            req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
            try:
                urllib.request.urlopen(req, timeout=10)
            except Exception:
                cur.close()
                conn.close()
                return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Не удалось отправить код в Telegram'})}

        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True, 'message': 'Код отправлен в Telegram'})}

    if method == 'POST' and action == 'verify_code':
        phone = body.get('phone', '').strip()
        code = body.get('code', '').strip()

        if not phone or not code:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите номер телефона и код'})}

        conn = get_db()
        cur = conn.cursor()

        status, user, message = check_access(cur, phone)
        if status not in ('owner', 'authorized'):
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': message or 'Доступ запрещён'})}

        cur.execute(
            "SELECT id FROM login_codes WHERE phone = %s AND code = %s AND expires_at > NOW()",
            (phone, code)
        )
        login_code = cur.fetchone()

        if not login_code:
            cur.close()
            conn.close()
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Неверный или просроченный код'})}

        cur.execute("DELETE FROM login_codes WHERE phone = %s", (phone,))

        token = secrets.token_hex(32)
        expires_at = datetime.now() + timedelta(days=30)
        cur.execute(
            "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (user[0], token, expires_at)
        )
        conn.commit()

        role = status
        manager_info = None
        if status == 'authorized':
            cur.execute(
                """SELECT m.first_name, m.last_name, r.name FROM managers m
                   LEFT JOIN roles r ON r.id = m.role_id
                   WHERE m.phone = %s""",
                (phone,)
            )
            mgr = cur.fetchone()
            if mgr:
                manager_info = {'first_name': mgr[0], 'last_name': mgr[1], 'role_name': mgr[2]}

        cur.close()
        conn.close()

        user_data = {'id': user[0], 'phone': phone, 'role': role}
        if manager_info:
            user_data.update(manager_info)

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'token': token, 'user': user_data})
        }

    if method == 'GET' and action == 'me':
        auth = event.get('headers', {}).get('X-Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        if not token:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """SELECT u.id, u.phone, u.role FROM users u
               JOIN user_sessions s ON s.user_id = u.id
               WHERE s.token = %s AND s.expires_at > NOW()""",
            (token,)
        )
        user = cur.fetchone()

        if not user:
            cur.close()
            conn.close()
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Сессия истекла'})}

        user_data = {'id': user[0], 'phone': user[1], 'role': user[2]}

        if user[2] == 'manager':
            cur.execute(
                """SELECT m.first_name, m.last_name, r.name FROM managers m
                   LEFT JOIN roles r ON r.id = m.role_id
                   WHERE m.phone = %s AND m.status = 'authorized'""",
                (user[1],)
            )
            mgr = cur.fetchone()
            if mgr:
                user_data['first_name'] = mgr[0]
                user_data['last_name'] = mgr[1]
                user_data['role_name'] = mgr[2]

        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'user': user_data})}

    if method == 'POST' and action == 'check_telegram':
        phone = body.get('phone', '').strip()
        if not phone:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите номер телефона'})}

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT telegram_chat_id FROM users WHERE phone = %s", (phone,))
        user = cur.fetchone()
        cur.close()
        conn.close()

        if not user:
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'linked': False, 'error': 'Пользователь не найден'})}

        linked = user[0] is not None
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'linked': linked})}

    return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Not found'})}
