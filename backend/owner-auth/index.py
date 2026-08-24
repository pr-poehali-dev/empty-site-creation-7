import json
import os
import re
import hashlib
import secrets
import urllib.request
from datetime import datetime, timedelta
import psycopg2
from tg_transport import tg_call, tg_probe

WEAK_PASSWORDS = {'12345678', 'qwerty123', 'password', 'password1', 'qwertyui', 'admin123', '1q2w3e4r'}


def validate_password(password: str, phone: str):
    if len(password) < 8:
        return 'Пароль должен быть не короче 8 символов'
    if re.search(r'[^\x20-\x7E]', password):
        return 'Только английская раскладка: латинские буквы, цифры и символы'
    if not re.search(r'[A-Z]', password):
        return 'Добавьте заглавную латинскую букву'
    if not re.search(r'[a-z]', password):
        return 'Добавьте строчную латинскую букву'
    if not re.search(r'\d', password):
        return 'Добавьте цифру'
    if not re.search(r'[!@#$%^&*()\-_=+\[\]{};:,.<>/?~`|\\\'"]', password):
        return 'Добавьте специальный символ'
    low = password.lower()
    if low in WEAK_PASSWORDS:
        return 'Слишком простой пароль'
    digits = re.sub(r'\D', '', phone)
    if digits and len(digits) >= 6 and digits in re.sub(r'\D', '', password):
        return 'Пароль не должен содержать номер телефона'
    return None


def hash_password(password: str, salt: str = '') -> str:
    if not salt:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 120000)
    return f'{salt}${dk.hex()}'


def verify_password(password: str, stored: str) -> bool:
    if not stored or '$' not in stored:
        return False
    salt = stored.split('$', 1)[0]
    return secrets.compare_digest(hash_password(password, salt), stored)


def create_session(cur, user_id):
    token = secrets.token_hex(32)
    cur.execute(
        "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, token, datetime.now() + timedelta(days=30))
    )
    return token


def build_user_data(cur, user_id, phone, role):
    data = {'id': user_id, 'phone': phone, 'role': role}
    if role == 'authorized':
        cur.execute(
            """SELECT m.first_name, m.last_name, r.name FROM managers m
               LEFT JOIN roles r ON r.id = m.role_id
               WHERE m.phone = %s""",
            (phone,)
        )
        mgr = cur.fetchone()
        if mgr:
            data.update({'first_name': mgr[0], 'last_name': mgr[1], 'role_name': mgr[2]})
    return data

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
            result, why = tg_call(cur, 'sendMessage', {
                'chat_id': user[2],
                'text': f'{code} — код авторизации.\n\nДействителен 5 минут.',
                'parse_mode': 'HTML'
            }, bot_token)
            conn.commit()
            if not result:
                cur.close()
                conn.close()
                return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': why or 'Не удалось отправить код в Telegram'})}

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

    if method == 'POST' and action == 'tg_probe':
        auth = event.get('headers', {}).get('X-Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """SELECT u.role FROM users u JOIN user_sessions s ON s.user_id = u.id
               WHERE s.token = %s AND s.expires_at > NOW()""",
            (token,)
        )
        me = cur.fetchone()
        if not me or me[0] != 'owner':
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Доступно только владельцу'})}

        report = tg_probe(cur)
        cur.execute(
            """SELECT route, ok, last_success_at, fail_count, last_error
               FROM tg_route_state ORDER BY last_success_at DESC NULLS LAST"""
        )
        report['state'] = [
            {
                'route': r[0], 'ok': r[1],
                'last_success': r[2].isoformat() if r[2] else None,
                'fail_count': r[3], 'last_error': r[4],
            }
            for r in cur.fetchall()
        ]
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps(report, ensure_ascii=False)}

    if method == 'POST' and action == 'password_status':
        phone = body.get('phone', '').strip()
        conn = get_db()
        cur = conn.cursor()
        status, user, message = check_access(cur, phone)
        if status not in ('owner', 'authorized'):
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': message or 'Доступ запрещён'})}
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user[0],))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'has_password': bool(row and row[0])})}

    if method == 'POST' and action == 'set_password':
        phone = body.get('phone', '').strip()
        password = body.get('password', '')
        confirm = body.get('confirm', '')

        if password != confirm:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Пароли не совпадают'})}

        err = validate_password(password, phone)
        if err:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': err})}

        conn = get_db()
        cur = conn.cursor()
        status, user, message = check_access(cur, phone)
        if status not in ('owner', 'authorized'):
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': message or 'Доступ запрещён'})}

        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user[0],))
        row = cur.fetchone()
        if row and row[0]:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Пароль уже установлен'})}

        cur.execute(
            "UPDATE users SET password_hash = %s, password_fail_count = 0, password_locked_until = NULL WHERE id = %s",
            (hash_password(password), user[0])
        )
        token = create_session(cur, user[0])
        conn.commit()
        user_data = build_user_data(cur, user[0], phone, status)
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'token': token, 'user': user_data})}

    if method == 'POST' and action == 'login_password':
        phone = body.get('phone', '').strip()
        password = body.get('password', '')

        conn = get_db()
        cur = conn.cursor()
        status, user, message = check_access(cur, phone)
        if status not in ('owner', 'authorized'):
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': message or 'Доступ запрещён'})}

        cur.execute("SELECT password_hash, password_fail_count, password_locked_until FROM users WHERE id = %s", (user[0],))
        row = cur.fetchone()

        if not row or not row[0]:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Пароль не установлен', 'need_setup': True})}

        if row[2] and row[2] > datetime.now():
            mins = max(1, int((row[2] - datetime.now()).total_seconds() // 60) + 1)
            cur.close()
            conn.close()
            return {'statusCode': 429, 'headers': headers, 'body': json.dumps({'error': f'Слишком много попыток. Повторите через {mins} мин.'})}

        if not verify_password(password, row[0]):
            fails = (row[1] or 0) + 1
            if fails >= 5:
                cur.execute(
                    "UPDATE users SET password_fail_count = 0, password_locked_until = %s WHERE id = %s",
                    (datetime.now() + timedelta(minutes=15), user[0])
                )
                conn.commit()
                cur.close()
                conn.close()
                return {'statusCode': 429, 'headers': headers, 'body': json.dumps({'error': 'Слишком много попыток. Вход заблокирован на 15 минут.'})}
            cur.execute("UPDATE users SET password_fail_count = %s WHERE id = %s", (fails, user[0]))
            conn.commit()
            cur.close()
            conn.close()
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': f'Неверный пароль. Осталось попыток: {5 - fails}'})}

        cur.execute("UPDATE users SET password_fail_count = 0, password_locked_until = NULL WHERE id = %s", (user[0],))
        token = create_session(cur, user[0])
        conn.commit()
        user_data = build_user_data(cur, user[0], phone, status)
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'token': token, 'user': user_data})}

    if method == 'POST' and action == 'change_password':
        auth = event.get('headers', {}).get('X-Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        old_password = body.get('old_password', '')
        password = body.get('password', '')
        confirm = body.get('confirm', '')

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """SELECT u.id, u.phone, u.password_hash FROM users u
               JOIN user_sessions s ON s.user_id = u.id
               WHERE s.token = %s AND s.expires_at > NOW()""",
            (token,)
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

        if row[2] and not verify_password(old_password, row[2]):
            cur.close()
            conn.close()
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Текущий пароль неверный'})}

        if password != confirm:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Пароли не совпадают'})}

        err = validate_password(password, row[1])
        if err:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': err})}

        cur.execute(
            "UPDATE users SET password_hash = %s, password_fail_count = 0, password_locked_until = NULL WHERE id = %s",
            (hash_password(password), row[0])
        )
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True})}

    if method == 'POST' and action == 'reset_password':
        auth = event.get('headers', {}).get('X-Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        target_phone = body.get('target_phone', '').strip()

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """SELECT u.id, u.role FROM users u
               JOIN user_sessions s ON s.user_id = u.id
               WHERE s.token = %s AND s.expires_at > NOW()""",
            (token,)
        )
        me = cur.fetchone()
        if not me or me[1] != 'owner':
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Доступно только владельцу'})}

        cur.execute(
            "UPDATE users SET password_hash = NULL, password_fail_count = 0, password_locked_until = NULL WHERE phone = %s",
            (target_phone,)
        )
        affected = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()

        if not affected:
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Пользователь не найден'})}
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True})}

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