"""Получение и управление категориями каталога"""
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
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
        cur.close()
        conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    user_role = user[2]

    if method == 'GET':
        cur.execute(
            "SELECT id, parent_id, name, sort_order, keywords FROM categories ORDER BY sort_order, name"
        )
        rows = cur.fetchall()
        categories = []
        for r in rows:
            categories.append({
                'id': r[0],
                'parent_id': r[1],
                'name': r[2],
                'sort_order': r[3],
                'keywords': r[4] or []
            })
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'categories': categories})}

    if user_role != 'owner':
        cur.close()
        conn.close()
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав для этого действия'})}

    if method == 'POST':
        name = body.get('name', '').strip()
        parent_id = body.get('parent_id')
        sort_order = body.get('sort_order', 0)

        if not name:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите название категории'})}

        cur.execute(
            "INSERT INTO categories (parent_id, name, sort_order) VALUES (%s, %s, %s) RETURNING id, parent_id, name, sort_order",
            (parent_id, name, sort_order)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 201, 'headers': headers, 'body': json.dumps({
            'category': {'id': row[0], 'parent_id': row[1], 'name': row[2], 'sort_order': row[3]}
        })}

    if method == 'PUT':
        cat_id = params.get('id')
        if not cat_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id категории'})}

        name = body.get('name', '').strip()
        parent_id = body.get('parent_id')
        sort_order = body.get('sort_order')

        if not name:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите название'})}

        cur.execute(
            "UPDATE categories SET name = %s, parent_id = %s, sort_order = COALESCE(%s, sort_order) WHERE id = %s RETURNING id, parent_id, name, sort_order",
            (name, parent_id, sort_order, cat_id)
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Категория не найдена'})}

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
            'category': {'id': row[0], 'parent_id': row[1], 'name': row[2], 'sort_order': row[3]}
        })}

    if method == 'DELETE':
        cat_id = params.get('id')
        if not cat_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id категории'})}

        cur.execute("SELECT COUNT(*) FROM nomenclature WHERE category_id = %s", (cat_id,))
        count = cur.fetchone()[0]
        if count > 0:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нельзя удалить категорию с номенклатурой'})}

        cur.execute("SELECT COUNT(*) FROM categories WHERE parent_id = %s", (cat_id,))
        child_count = cur.fetchone()[0]
        if child_count > 0:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нельзя удалить категорию с подкатегориями'})}

        cur.execute("DELETE FROM categories WHERE id = %s", (cat_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}