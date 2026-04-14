"""Управление брендами: список, переименование, замена при удалении"""
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


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')

    req_headers = event.get('headers', {})
    auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()

    user = get_user_by_token(cur, token)
    if not user:
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    if user[2] != 'owner':
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав'})}

    if method == 'GET':
        cur.execute("""
            SELECT brand, COUNT(*) as cnt FROM products
            WHERE brand IS NOT NULL AND brand != ''
            GROUP BY brand
            UNION ALL
            SELECT brand, COUNT(*) as cnt FROM temp_products
            WHERE brand IS NOT NULL AND brand != '' AND status = 'pending'
            GROUP BY brand
        """)
        rows = cur.fetchall()
        # Merge counts
        merged = {}
        for r in rows:
            merged[r[0]] = merged.get(r[0], 0) + r[1]
        items = [{'name': k, 'count': v} for k, v in sorted(merged.items())]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': items})}

    if method == 'PUT':
        old_name = (body.get('old_name') or '').strip()
        new_name = (body.get('new_name') or '').strip()
        if not old_name or not new_name:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'old_name и new_name обязательны'})}

        cur.execute("UPDATE products SET brand = %s WHERE brand = %s", (new_name, old_name))
        cur.execute("UPDATE temp_products SET brand = %s WHERE brand = %s", (new_name, old_name))
        conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if method == 'DELETE':
        brand = (body.get('brand') or '').strip()
        replace_with = (body.get('replace_with') or '').strip() or None
        if not brand:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'brand обязателен'})}

        if replace_with:
            cur.execute("UPDATE products SET brand = %s WHERE brand = %s", (replace_with, brand))
            cur.execute("UPDATE temp_products SET brand = %s WHERE brand = %s", (replace_with, brand))
        else:
            cur.execute("UPDATE products SET brand = NULL WHERE brand = %s", (brand,))
            cur.execute("UPDATE temp_products SET brand = '' WHERE brand = %s", (brand,))

        conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}
