"""Временные товары: CRUD для товаров, не найденных в каталоге"""
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


def get_manager_id(cur, phone):
    cur.execute("SELECT id FROM managers WHERE phone = %s", (phone,))
    row = cur.fetchone()
    return row[0] if row else None


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
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    is_owner = user[2] == 'owner'

    if method == 'GET':
        search = params.get('search', '').strip()
        status_filter = params.get('status', '')
        page = int(params.get('page', 1))
        per_page = int(params.get('per_page', 50))
        offset = (page - 1) * per_page

        conditions = []
        args = []

        if search:
            conditions.append("(LOWER(brand) LIKE %s OR LOWER(article) LIKE %s)")
            args += [f'%{search.lower()}%', f'%{search.lower()}%']
        if status_filter:
            conditions.append("status = %s")
            args.append(status_filter)

        where = ('WHERE ' + ' AND '.join(conditions)) if conditions else ''

        cur.execute(f"SELECT COUNT(*) FROM temp_products {where}", args)
        total = cur.fetchone()[0]

        cur.execute(
            f"""SELECT id, brand, article, quantity, price, status, nomenclature_id, created_by, created_at, barcode
                FROM temp_products {where}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s""",
            args + [per_page, offset]
        )
        rows = cur.fetchall()
        tp_ids = [r[0] for r in rows]
        usage_map = {}
        if tp_ids:
            placeholders = ','.join(['%s'] * len(tp_ids))
            cur.execute(f"SELECT temp_product_id, COUNT(DISTINCT order_id) FROM wholesale_order_items WHERE temp_product_id IN ({placeholders}) GROUP BY temp_product_id", tp_ids)
            for u in cur.fetchall():
                usage_map[u[0]] = u[1]
        items = []
        for r in rows:
            items.append({
                'id': r[0], 'brand': r[1], 'article': r[2],
                'quantity': float(r[3]), 'price': float(r[4]),
                'status': r[5], 'nomenclature_id': r[6],
                'created_by': r[7],
                'created_at': str(r[8]) if r[8] else None,
                'barcode': r[9],
                'usage_count': usage_map.get(r[0], 0)
            })

        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': items, 'total': total, 'page': page, 'per_page': per_page})}

    if method == 'POST':
        brand = (body.get('brand') or '').strip()
        article = (body.get('article') or '').strip()
        quantity = float(body.get('quantity') or 1)
        price = float(body.get('price') or 0)

        if not brand or not article:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'brand и article обязательны'})}

        manager_id = get_manager_id(cur, user[1])

        barcode = (body.get('barcode') or '').strip() or None
        cur.execute(
            """INSERT INTO temp_products (brand, article, quantity, price, created_by, barcode)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING id, brand, article, quantity, price, status, created_at""",
            (brand, article, quantity, price, manager_id, barcode)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
            'id': row[0], 'brand': row[1], 'article': row[2],
            'quantity': float(row[3]), 'price': float(row[4]),
            'status': row[5], 'created_at': str(row[6])
        })}

    if method == 'PUT':
        item_id = params.get('id')
        if not item_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'id обязателен'})}

        updates = []
        args = []

        if 'brand' in body:
            updates.append("brand = %s"); args.append(body['brand'])
        if 'article' in body:
            updates.append("article = %s"); args.append(body['article'])
        if 'quantity' in body:
            updates.append("quantity = %s"); args.append(float(body['quantity']))
        if 'price' in body:
            updates.append("price = %s"); args.append(float(body['price']))
        if 'status' in body:
            updates.append("status = %s"); args.append(body['status'])
        if 'nomenclature_id' in body:
            updates.append("nomenclature_id = %s"); args.append(body['nomenclature_id'])
        if 'barcode' in body:
            updates.append("barcode = %s"); args.append(body['barcode'])

        if not updates:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нет данных для обновления'})}

        args.append(item_id)
        cur.execute(f"UPDATE temp_products SET {', '.join(updates)} WHERE id = %s", args)
        conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if method == 'DELETE':
        item_id = params.get('id')
        if not item_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'id обязателен'})}

        replace_id = body.get('replace_product_id')
        replace_temp_id = body.get('replace_temp_product_id')
        keep_price = body.get('keep_price', True)

        if replace_id or replace_temp_id:
            new_pid = replace_id or 19
            new_temp_pid = replace_temp_id if not replace_id else None
            if keep_price:
                cur.execute("UPDATE wholesale_order_items SET product_id = %s, temp_product_id = %s WHERE temp_product_id = %s",
                            (new_pid, new_temp_pid, item_id))
            else:
                replace_price = float(body.get('replace_price', 0))
                cur.execute("UPDATE wholesale_order_items SET product_id = %s, temp_product_id = %s, price = %s, amount = quantity * %s WHERE temp_product_id = %s",
                            (new_pid, new_temp_pid, replace_price, replace_price, item_id))
            if replace_id:
                item_name = body.get('replace_name', '')
                if item_name:
                    cur.execute("UPDATE wholesale_order_items SET item_name = %s WHERE temp_product_id = %s", (item_name, new_temp_pid))

        cur.execute("DELETE FROM temp_products WHERE id = %s", (item_id,))
        conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}