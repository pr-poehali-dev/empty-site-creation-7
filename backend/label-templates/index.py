"""CRUD шаблонов этикеток для печати на термопринтере"""
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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
    }
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    h = event.get('headers') or {}
    token = h.get('X-Authorization', '') or h.get('x-authorization', '')
    token = token.replace('Bearer ', '')
    if not token:
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    conn = get_db()
    cur = conn.cursor()
    user = get_user_by_token(cur, token)
    if not user:
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    method = event.get('httpMethod', 'GET')
    qs = event.get('queryStringParameters') or {}
    tpl_id = qs.get('id')

    try:
        if method == 'GET':
            if tpl_id:
                cur.execute(
                    "SELECT id, name, width_mm, height_mm, dpi, rows_json FROM label_templates WHERE id = %s",
                    (int(tpl_id),)
                )
                row = cur.fetchone()
                if not row:
                    return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Шаблон не найден'})}
                return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                    'id': row[0], 'name': row[1], 'width_mm': float(row[2]), 'height_mm': float(row[3]),
                    'dpi': row[4], 'rows': row[5] or []
                })}
            cur.execute("SELECT id, name, width_mm, height_mm, dpi, rows_json FROM label_templates ORDER BY name")
            rows = cur.fetchall()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': [
                {'id': r[0], 'name': r[1], 'width_mm': float(r[2]), 'height_mm': float(r[3]), 'dpi': r[4], 'rows': r[5] or []}
                for r in rows
            ]})}

        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            name = (body.get('name') or '').strip()
            if not name:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Название обязательно'})}
            width_mm = float(body.get('width_mm') or 58)
            height_mm = float(body.get('height_mm') or 40)
            dpi = int(body.get('dpi') or 203)
            rows_json = json.dumps(body.get('rows') or [])
            cur.execute(
                "INSERT INTO label_templates (name, width_mm, height_mm, dpi, rows_json) VALUES (%s, %s, %s, %s, %s::jsonb) RETURNING id",
                (name, width_mm, height_mm, dpi, rows_json)
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            return {'statusCode': 201, 'headers': headers, 'body': json.dumps({'id': new_id})}

        if method == 'PUT':
            if not tpl_id:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'id обязателен'})}
            body = json.loads(event.get('body') or '{}')
            name = (body.get('name') or '').strip()
            if not name:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Название обязательно'})}
            width_mm = float(body.get('width_mm') or 58)
            height_mm = float(body.get('height_mm') or 40)
            dpi = int(body.get('dpi') or 203)
            rows_json = json.dumps(body.get('rows') or [])
            cur.execute(
                "UPDATE label_templates SET name=%s, width_mm=%s, height_mm=%s, dpi=%s, rows_json=%s::jsonb, updated_at=NOW() WHERE id=%s",
                (name, width_mm, height_mm, dpi, rows_json, int(tpl_id))
            )
            conn.commit()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

        if method == 'DELETE':
            if not tpl_id:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'id обязателен'})}
            cur.execute("DELETE FROM label_templates WHERE id = %s", (int(tpl_id),))
            conn.commit()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

        return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}
    finally:
        cur.close()
        conn.close()
