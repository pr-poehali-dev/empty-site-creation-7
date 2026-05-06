"""Управление оптовиками: список, создание, удаление, счётчики использований"""
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
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    raw_headers = event.get('headers') or {}
    token = raw_headers.get('X-Authorization', '') or raw_headers.get('x-authorization', '')
    token = token.replace('Bearer ', '')
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
    qs = event.get('queryStringParameters') or {}

    if method == 'GET':
        with_stats = qs.get('withStats') in ('1', 'true', 'yes')
        search = (qs.get('search') or '').strip()

        if with_stats:
            cur.execute(
                """SELECT w.id, w.name,
                          COALESCE(o.cnt, 0) AS orders_count,
                          COALESCE(r.cnt, 0) AS returns_count
                   FROM wholesalers w
                   LEFT JOIN (SELECT wholesaler_id, COUNT(*) AS cnt FROM wholesale_orders  WHERE wholesaler_id IS NOT NULL GROUP BY wholesaler_id) o ON o.wholesaler_id = w.id
                   LEFT JOIN (SELECT wholesaler_id, COUNT(*) AS cnt FROM wholesale_returns WHERE wholesaler_id IS NOT NULL GROUP BY wholesaler_id) r ON r.wholesaler_id = w.id
                   ORDER BY w.name"""
            )
            rows = cur.fetchall()
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': [
                {'id': r[0], 'name': r[1], 'orders_count': int(r[2]), 'returns_count': int(r[3])} for r in rows
            ]})}

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

    if method == 'DELETE':
        try:
            wid = int(qs.get('id') or '')
        except (ValueError, TypeError):
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан id'})}

        cur.execute("SELECT name FROM wholesalers WHERE id = %s", (wid,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Оптовик не найден'})}

        cur.execute("SELECT COUNT(*) FROM wholesale_orders  WHERE wholesaler_id = %s", (wid,))
        orders_count = int(cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM wholesale_returns WHERE wholesaler_id = %s", (wid,))
        returns_count = int(cur.fetchone()[0])

        if orders_count > 0 or returns_count > 0:
            cur.close()
            conn.close()
            return {'statusCode': 409, 'headers': headers, 'body': json.dumps({
                'error': 'Нельзя удалить: оптовик участвует в заявках или возвратах',
                'orders_count': orders_count,
                'returns_count': returns_count,
            })}

        cur.execute("DELETE FROM wholesalers WHERE id = %s", (wid,))
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}
