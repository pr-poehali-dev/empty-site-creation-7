import json
import os
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_owner(cur, token: str):
    cur.execute(
        '''SELECT o.id FROM owners o
           JOIN owner_sessions s ON s.owner_id = o.id
           WHERE s.token = %s AND s.expires_at > NOW()''',
        (token,)
    )
    row = cur.fetchone()
    return row[0] if row else None

def handler(event: dict, context) -> dict:
    """Управление сотрудниками и ролями владельца"""
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

    auth = event.get('headers', {}).get('X-Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()

    owner_id = get_owner(cur, token)
    if not owner_id:
        cur.close()
        conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    # GET /roles — список ролей
    if method == 'GET' and path.endswith('/roles'):
        cur.execute('SELECT id, name, description FROM roles ORDER BY id')
        rows = cur.fetchall()
        roles = [{'id': r[0], 'name': r[1], 'description': r[2]} for r in rows]
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'roles': roles})}

    # POST /roles — создать роль
    if method == 'POST' and path.endswith('/roles'):
        name = body.get('name', '').strip()
        description = body.get('description', '').strip()
        if not name:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите название роли'})}
        cur.execute('INSERT INTO roles (name, description) VALUES (%s, %s) RETURNING id, name, description', (name, description))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'role': {'id': row[0], 'name': row[1], 'description': row[2]}})}

    # GET /employees — список сотрудников
    if method == 'GET' and path.endswith('/employees'):
        cur.execute(
            '''SELECT e.id, e.name, e.email, r.id, r.name, e.created_at
               FROM employees e
               LEFT JOIN roles r ON r.id = e.role_id
               WHERE e.owner_id = %s
               ORDER BY e.created_at DESC''',
            (owner_id,)
        )
        rows = cur.fetchall()
        employees = [
            {
                'id': r[0],
                'name': r[1],
                'email': r[2],
                'role': {'id': r[3], 'name': r[4]} if r[3] else None,
                'created_at': r[5].isoformat() if r[5] else None
            }
            for r in rows
        ]
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'employees': employees})}

    # POST /employees — добавить сотрудника
    if method == 'POST' and path.endswith('/employees'):
        name = body.get('name', '').strip()
        email = body.get('email', '').strip().lower()
        role_id = body.get('role_id')

        if not name or not email:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите имя и email сотрудника'})}

        cur.execute(
            'INSERT INTO employees (owner_id, name, email, role_id) VALUES (%s, %s, %s, %s) RETURNING id, name, email, role_id, created_at',
            (owner_id, name, email, role_id)
        )
        emp = cur.fetchone()

        role = None
        if emp[3]:
            cur.execute('SELECT id, name FROM roles WHERE id = %s', (emp[3],))
            r = cur.fetchone()
            if r:
                role = {'id': r[0], 'name': r[1]}

        conn.commit()
        cur.close()
        conn.close()

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'employee': {
                    'id': emp[0],
                    'name': emp[1],
                    'email': emp[2],
                    'role': role,
                    'created_at': emp[4].isoformat() if emp[4] else None
                }
            })
        }

    # PUT /employees/{id} — изменить роль сотрудника
    if method == 'PUT' and '/employees/' in path:
        emp_id = path.split('/employees/')[-1].split('/')[0]
        role_id = body.get('role_id')

        cur.execute(
            'UPDATE employees SET role_id = %s WHERE id = %s AND owner_id = %s RETURNING id',
            (role_id, emp_id, owner_id)
        )
        if not cur.fetchone():
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Сотрудник не найден'})}

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True})}

    # DELETE /employees/{id} — удалить сотрудника (через UPDATE обнуление)
    if method == 'DELETE' and '/employees/' in path:
        emp_id = path.split('/employees/')[-1].split('/')[0]
        cur.execute(
            'UPDATE employees SET role_id = NULL WHERE id = %s AND owner_id = %s RETURNING id, name, email',
            (emp_id, owner_id)
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Сотрудник не найден'})}

        cur.execute('UPDATE employees SET name = name WHERE id = %s', (emp_id,))
        cur.execute('DELETE FROM employees WHERE id = %s AND owner_id = %s', (int(emp_id), owner_id))
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True})}

    cur.close()
    conn.close()
    return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Not found'})}
