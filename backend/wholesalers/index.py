"""Управление оптовиками: список и создание"""
import json
import os
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_user_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.phone, u.role FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,)
    )
    return cur.fetchone()

def handler(event, context):
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    token = (event.get('headers') or {}).get('X-Authorization', '').replace('Bearer ', '')
    if not token:
        token = (event.get('headers') or {}).get('x-authorization', '').replace('Bearer ', '')
    if not token:
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    conn = get_db()
    cur = conn.cursor()
    user = get_user_by_token(cur, token)
    if not user:
        cur.close()
        conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    method = event.get('httpMethod', 'GET')

    if method == 'GET':
        search = (event.get('queryStringParameters') or {}).get('search', '').strip()
        if search:
            cur.execute("SELECT id, name FROM wholesalers WHERE name ILIKE %s ORDER BY name LIMIT 20", (f"%{search}%",))
        else:
            cur.execute("SELECT id, name FROM wholesalers ORDER BY name")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': [{'id': r[0], 'name': r[1]} for r in rows]})}

    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        name = (body.get('name') or '').strip()
        if not name:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Имя обязательно'})}
        cur.execute("SELECT id, name FROM wholesalers WHERE name = %s", (name,))
        existing = cur.fetchone()
        if existing:
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'id': existing[0], 'name': existing[1]})}
        cur.execute("INSERT INTO wholesalers (name) VALUES (%s) RETURNING id, name", (name,))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 201, 'headers': headers, 'body': json.dumps({'id': row[0], 'name': row[1]})}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}
