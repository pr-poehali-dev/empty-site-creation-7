import json
import os
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_owner_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.phone, u.telegram_chat_id FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW() AND u.role = 'owner'""",
        (token,)
    )
    return cur.fetchone()

def handler(event: dict, context) -> dict:
    """Управление управленцами: добавление, список по статусам, авторизация"""
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
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')

    auth = event.get('headers', {}).get('X-Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()

    owner = get_owner_by_token(cur, token)
    if not owner:
        cur.close()
        conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    if method == 'GET':
        status_filter = params.get('status')
        if status_filter:
            cur.execute(
                """SELECT m.id, m.phone, m.telegram_chat_id, m.first_name, m.last_name,
                          r.id, r.name, m.status, m.created_at
                   FROM managers m
                   LEFT JOIN roles r ON r.id = m.role_id
                   WHERE m.status = %s
                   ORDER BY m.created_at DESC""",
                (status_filter,)
            )
        else:
            cur.execute(
                """SELECT m.id, m.phone, m.telegram_chat_id, m.first_name, m.last_name,
                          r.id, r.name, m.status, m.created_at
                   FROM managers m
                   LEFT JOIN roles r ON r.id = m.role_id
                   ORDER BY m.created_at DESC"""
            )
        rows = cur.fetchall()
        managers = [
            {
                'id': r[0],
                'phone': r[1],
                'telegram_linked': r[2] is not None,
                'first_name': r[3],
                'last_name': r[4],
                'role': {'id': r[5], 'name': r[6]} if r[5] else None,
                'status': r[7],
                'created_at': r[8].isoformat() if r[8] else None
            }
            for r in rows
        ]
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'managers': managers})}

    if method == 'POST':
        phone = body.get('phone', '').strip()
        if not phone:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите номер телефона'})}

        cur.execute("SELECT id FROM managers WHERE phone = %s", (phone,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return {'statusCode': 409, 'headers': headers, 'body': json.dumps({'error': 'Управленец с таким номером уже существует'})}

        cur.execute("SELECT id FROM users WHERE phone = %s", (phone,))
        existing_user = cur.fetchone()
        if not existing_user:
            cur.execute(
                "INSERT INTO users (phone, role) VALUES (%s, 'manager')",
                (phone,)
            )

        cur.execute(
            "INSERT INTO managers (phone, status) VALUES (%s, 'not_authorized') RETURNING id, phone, status, created_at",
            (phone,)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'manager': {
                    'id': row[0],
                    'phone': row[1],
                    'status': row[2],
                    'created_at': row[3].isoformat() if row[3] else None
                }
            })
        }

    if method == 'PUT':
        manager_id = params.get('id')
        if not manager_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id управленца'})}

        first_name = body.get('first_name', '').strip()
        last_name = body.get('last_name', '').strip()
        role_id = body.get('role_id')

        if not first_name or not last_name or not role_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите имя, фамилию и роль'})}

        cur.execute("SELECT id FROM roles WHERE id = %s", (role_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Роль не найдена'})}

        cur.execute(
            """UPDATE managers
               SET first_name = %s, last_name = %s, role_id = %s, status = 'authorized'
               WHERE id = %s AND status = 'pending'
               RETURNING id, phone, first_name, last_name, status""",
            (first_name, last_name, role_id, manager_id)
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Управленец не найден или не в статусе ожидания'})}

        conn.commit()
        cur.close()
        conn.close()
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'manager': {
                    'id': row[0],
                    'phone': row[1],
                    'first_name': row[2],
                    'last_name': row[3],
                    'status': row[4]
                }
            })
        }

    if method == 'DELETE':
        manager_id = params.get('id')
        if not manager_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id управленца'})}

        cur.execute("SELECT phone FROM managers WHERE id = %s", (int(manager_id),))
        mgr = cur.fetchone()
        if not mgr:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Управленец не найден'})}

        cur.execute("UPDATE managers SET status = 'not_authorized', telegram_chat_id = NULL, first_name = NULL, last_name = NULL, role_id = NULL WHERE id = %s", (int(manager_id),))
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True})}

    cur.close()
    conn.close()
    return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Not found'})}
