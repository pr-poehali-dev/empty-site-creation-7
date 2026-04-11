import json
import os
import secrets
import urllib.request
from datetime import datetime, timedelta
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

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

    if method == 'POST' and action == 'send_code':
        phone = body.get('phone', '').strip()
        if not phone:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите номер телефона'})}

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, telegram_chat_id FROM users WHERE phone = %s", (phone,))
        user = cur.fetchone()

        if not user:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Пользователь не найден'})}

        if not user[1]:
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
                'chat_id': user[1],
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
        cur.execute("SELECT id, phone, role FROM users WHERE phone = %s", (phone,))
        user = cur.fetchone()

        token = secrets.token_hex(32)
        expires_at = datetime.now() + timedelta(days=30)
        cur.execute(
            "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (user[0], token, expires_at)
        )
        conn.commit()
        cur.close()
        conn.close()

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'token': token,
                'user': {'id': user[0], 'phone': user[1], 'role': user[2]}
            })
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
        cur.close()
        conn.close()

        if not user:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Сессия истекла'})}

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'user': {'id': user[0], 'phone': user[1], 'role': user[2]}})
        }

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