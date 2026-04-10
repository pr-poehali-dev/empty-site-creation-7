import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def handler(event: dict, context) -> dict:
    """Авторизация и регистрация владельца сайта"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    path = event.get('path', '/')
    method = event.get('httpMethod', 'GET')
    body = json.loads(event.get('body') or '{}')

    conn = get_db()
    cur = conn.cursor()

    # POST /register
    if method == 'POST' and path.endswith('/register'):
        email = body.get('email', '').strip().lower()
        password = body.get('password', '')
        name = body.get('name', '').strip()

        if not email or not password or not name:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Заполните все поля'})}

        if len(password) < 6:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Пароль должен быть не менее 6 символов'})}

        cur.execute('SELECT id FROM owners WHERE email = %s', (email,))
        if cur.fetchone():
            return {'statusCode': 409, 'headers': headers, 'body': json.dumps({'error': 'Владелец с таким email уже существует'})}

        pw_hash = hash_password(password)
        cur.execute(
            'INSERT INTO owners (email, password_hash, name) VALUES (%s, %s, %s) RETURNING id, name, email',
            (email, pw_hash, name)
        )
        owner = cur.fetchone()
        token = secrets.token_hex(32)
        expires_at = datetime.now() + timedelta(days=30)
        cur.execute(
            'INSERT INTO owner_sessions (owner_id, token, expires_at) VALUES (%s, %s, %s)',
            (owner[0], token, expires_at)
        )
        conn.commit()
        cur.close()
        conn.close()

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'token': token, 'owner': {'id': owner[0], 'name': owner[1], 'email': owner[2]}})
        }

    # POST /login
    if method == 'POST' and path.endswith('/login'):
        email = body.get('email', '').strip().lower()
        password = body.get('password', '')

        if not email or not password:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Заполните все поля'})}

        pw_hash = hash_password(password)
        cur.execute('SELECT id, name, email FROM owners WHERE email = %s AND password_hash = %s', (email, pw_hash))
        owner = cur.fetchone()

        if not owner:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Неверный email или пароль'})}

        token = secrets.token_hex(32)
        expires_at = datetime.now() + timedelta(days=30)
        cur.execute(
            'INSERT INTO owner_sessions (owner_id, token, expires_at) VALUES (%s, %s, %s)',
            (owner[0], token, expires_at)
        )
        conn.commit()
        cur.close()
        conn.close()

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'token': token, 'owner': {'id': owner[0], 'name': owner[1], 'email': owner[2]}})
        }

    # GET /me
    if method == 'GET' and path.endswith('/me'):
        auth = event.get('headers', {}).get('X-Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        if not token:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

        cur.execute(
            '''SELECT o.id, o.name, o.email FROM owners o
               JOIN owner_sessions s ON s.owner_id = o.id
               WHERE s.token = %s AND s.expires_at > NOW()''',
            (token,)
        )
        owner = cur.fetchone()
        cur.close()
        conn.close()

        if not owner:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Сессия истекла'})}

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'owner': {'id': owner[0], 'name': owner[1], 'email': owner[2]}})
        }

    cur.close()
    conn.close()
    return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Not found'})}
