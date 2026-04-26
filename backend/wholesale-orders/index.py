"""CRUD оптовых заявок"""
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

def get_manager_info(cur, phone):
    cur.execute(
        """SELECT m.id, m.role_id, r.name as role_name FROM managers m
           LEFT JOIN roles r ON r.id = m.role_id
           WHERE m.phone = %s AND m.status = 'authorized'""",
        (phone,)
    )
    return cur.fetchone()

ALLOWED_ROLES = ['Управляющий', 'Менеджер опта']
CAN_CREATE_ROLES = ['Управляющий', 'Менеджер опта']

import re

def check_condition(price_map, cond_field, cond_op, cond_val):
    if not cond_field or not cond_op or cond_val is None:
        return True
    price = float(price_map.get(cond_field) or 0)
    val = float(cond_val)
    if cond_op == '<': return price < val
    if cond_op == '>': return price > val
    if cond_op == '=': return price == val
    if cond_op == '<=': return price <= val
    if cond_op == '>=': return price >= val
    return True

def apply_formula(base, formula):
    for m in re.finditer(r'([+\-*/])\s*([\d.]+)', formula):
        v = float(m.group(2))
        op = m.group(1)
        if op == '*': base *= v
        elif op == '/': base = base / v if v else 0
        elif op == '+': base += v
        elif op == '-': base -= v
    return round(base, 2)

def calc_price_by_rules(cur, customer_name, product_id):
    cur.execute("SELECT id FROM wholesalers WHERE name = %s", (customer_name,))
    w = cur.fetchone()
    if not w:
        return 0
    wholesaler_id = w[0]
    cur.execute(
        """SELECT filter_type, filter_value, price_field, formula,
                  condition_price_field, condition_operator, condition_value
           FROM pricing_rules WHERE wholesaler_id = %s ORDER BY priority""",
        (wholesaler_id,)
    )
    rules = cur.fetchall()
    if not rules:
        return 0
    cur.execute(
        "SELECT price_base, price_retail, price_wholesale, price_purchase, product_group FROM products WHERE id = %s",
        (product_id,)
    )
    prod = cur.fetchone()
    if not prod:
        return 0
    price_map = {'price_base': prod[0], 'price_retail': prod[1], 'price_wholesale': prod[2], 'price_purchase': prod[3]}
    product_group = prod[4]
    matched = None
    for r in rules:
        if r[0] == 'product_group' and product_group == r[1]:
            if check_condition(price_map, r[4], r[5], r[6]):
                matched = r
                break
    if not matched:
        return float(price_map.get('price_wholesale') or 0)
    base = float(price_map.get(matched[2]) or 0)
    return apply_formula(base, matched[3])

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

    user_id, user_phone, user_role = user
    is_owner = user_role == 'owner'

    manager_id = None
    role_name = None
    if not is_owner:
        mgr = get_manager_info(cur, user_phone)
        if not mgr:
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет доступа'})}
        manager_id, _, role_name = mgr
        if role_name not in ALLOWED_ROLES:
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет доступа к заявкам'})}

    if method == 'GET':
        order_id = params.get('id')
        if order_id:
            cur.execute(
                """SELECT o.id, o.customer_name, o.comment, o.status, o.total_amount,
                          o.created_at, m.first_name, m.last_name, o.payment_status, o.paid_amount, o.is_restored
                   FROM wholesale_orders o
                   JOIN managers m ON m.id = o.created_by
                   WHERE o.id = %s""",
                (order_id,)
            )
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Заявка не найдена'})}

            cur.execute(
                """SELECT oi.id, oi.product_id, p.name, p.article, oi.quantity, oi.price, oi.amount, oi.temp_product_id, oi.item_name, oi.from_bulk
                   FROM wholesale_order_items oi
                   JOIN products p ON p.id = oi.product_id
                   WHERE oi.order_id = %s
                   ORDER BY oi.id""",
                (order_id,)
            )
            items = []
            for r in cur.fetchall():
                is_temp = r[7] is not None or r[1] == 19
                if is_temp:
                    display_name = r[8] or r[2]
                else:
                    display_name = r[2]
                items.append({
                    'id': r[0], 'product_id': r[1] if r[1] != 19 else None, 'name': display_name,
                    'article': r[3] if r[3] != '__TEMP__' else None,
                    'quantity': r[4], 'price': float(r[5]), 'amount': float(r[6]),
                    'is_temp': is_temp, 'temp_product_id': r[7], 'has_uuid': False if is_temp else bool(r[3]),
                    'from_bulk': bool(r[9])
                })

            order = {
                'id': row[0], 'customer_name': row[1], 'comment': row[2],
                'status': row[3], 'total_amount': float(row[4]),
                'created_at': str(row[5]), 'created_by': f"{row[6]} {row[7]}",
                'payment_status': row[8], 'paid_amount': float(row[9]),
                'is_restored': row[10],
                'items': items
            }
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'order': order})}

        status_filter = params.get('status')
        include_archived = params.get('include_archived') == '1'
        conditions = []
        values = []
        if status_filter:
            conditions.append("o.status = %s")
            values.append(status_filter)
        elif not include_archived:
            conditions.append("o.status != 'archived'")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        cur.execute(
            f"""SELECT o.id, o.customer_name, o.comment, o.status, o.total_amount,
                       o.created_at, m.first_name, m.last_name, o.payment_status, o.paid_amount, o.is_restored
                FROM wholesale_orders o
                JOIN managers m ON m.id = o.created_by
                {where}
                ORDER BY o.created_at DESC
                LIMIT 100""",
            values
        )
        orders = []
        for r in cur.fetchall():
            orders.append({
                'id': r[0], 'customer_name': r[1], 'comment': r[2],
                'status': r[3], 'total_amount': float(r[4]),
                'created_at': str(r[5]), 'created_by': f"{r[6]} {r[7]}",
                'payment_status': r[8], 'paid_amount': float(r[9]),
                'is_restored': r[10]
            })

        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'orders': orders})}

    if method == 'POST':
        if is_owner:
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Владелец не может создавать заявки'})}

        if role_name not in CAN_CREATE_ROLES:
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав на создание заявок'})}

        customer_name = body.get('customer_name', '').strip()
        comment = (body.get('comment') or '').strip() or None
        items = body.get('items', [])

        if not customer_name:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите имя оптовика'})}

        if not items:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Добавьте хотя бы одну позицию'})}

        total = 0
        for item in items:
            price = float(item.get('price', 0))
            if price == 0:
                price = calc_price_by_rules(cur, customer_name, item.get('product_id'))
            amount = price * int(item.get('quantity', 0))
            item['_price'] = price
            total += amount

        cur.execute(
            """INSERT INTO wholesale_orders (customer_name, comment, total_amount, created_by)
               VALUES (%s, %s, %s, %s) RETURNING id""",
            (customer_name, comment, total, manager_id)
        )
        order_id = cur.fetchone()[0]

        cur.execute("INSERT INTO wholesalers (name) VALUES (%s) ON CONFLICT (name) DO NOTHING", (customer_name,))

        TEMP_PRODUCT_ID = 19
        for item in items:
            qty = int(item.get('quantity', 1))
            price = item.get('_price', float(item.get('price', 0)))
            amount = price * qty
            pid = item.get('product_id') or TEMP_PRODUCT_ID
            temp_pid = item.get('temp_product_id')
            item_name = item.get('name')
            from_bulk = bool(item.get('from_bulk'))
            cur.execute(
                """INSERT INTO wholesale_order_items (order_id, product_id, quantity, price, amount, temp_product_id, item_name, from_bulk)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (order_id, pid, qty, price, amount, temp_pid, item_name, from_bulk)
            )

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 201, 'headers': headers, 'body': json.dumps({'id': order_id})}

    if method == 'PUT':
        order_id = params.get('id')
        if not order_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан id заявки'})}

        cur.execute("SELECT id, status FROM wholesale_orders WHERE id = %s", (order_id,))
        order = cur.fetchone()
        if not order:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Заявка не найдена'})}

        action = body.get('action')
        if action == 'apply_pricing':
            if not is_owner and role_name != 'Управляющий':
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав'})}
            cur.execute("SELECT customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
            cname = cur.fetchone()[0]
            cur.execute(
                "SELECT id, product_id, quantity FROM wholesale_order_items WHERE order_id = %s",
                (order_id,)
            )
            rows = cur.fetchall()
            total = 0
            for row in rows:
                item_id, pid, qty = row
                price = calc_price_by_rules(cur, cname, pid)
                amount = price * qty
                total += amount
                cur.execute(
                    "UPDATE wholesale_order_items SET price = %s, amount = %s WHERE id = %s",
                    (price, amount, item_id)
                )
            cur.execute("UPDATE wholesale_orders SET total_amount = %s WHERE id = %s", (total, order_id))
            conn.commit()
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True, 'total': float(total)})}

        customer_name = body.get('customer_name')
        comment_val = body.get('comment')
        items = body.get('items')

        if customer_name is not None:
            cur.execute("UPDATE wholesale_orders SET customer_name = %s WHERE id = %s", (customer_name.strip(), order_id))
            cur.execute("INSERT INTO wholesalers (name) VALUES (%s) ON CONFLICT (name) DO NOTHING", (customer_name.strip(),))
        if 'comment' in body:
            cur.execute("UPDATE wholesale_orders SET comment = %s WHERE id = %s", (comment_val, order_id))

        if items is not None:
            cur.execute("SELECT customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
            cname = cur.fetchone()[0]
            cur.execute("DELETE FROM wholesale_order_items WHERE order_id = %s", (order_id,))
            TEMP_PRODUCT_ID = 19
            total = 0
            for item in items:
                qty = int(item.get('quantity', 1))
                price = float(item.get('price', 0))
                pid = item.get('product_id') or TEMP_PRODUCT_ID
                if price == 0 and pid != TEMP_PRODUCT_ID:
                    price = calc_price_by_rules(cur, customer_name or cname, pid)
                amount = price * qty
                total += amount
                temp_pid = item.get('temp_product_id')
                item_name = item.get('name')
                from_bulk = bool(item.get('from_bulk'))
                cur.execute(
                    "INSERT INTO wholesale_order_items (order_id, product_id, quantity, price, amount, temp_product_id, item_name, from_bulk) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (order_id, pid, qty, price, amount, temp_pid, item_name, from_bulk)
                )
            cur.execute("UPDATE wholesale_orders SET total_amount = %s WHERE id = %s", (total, order_id))

        new_status = body.get('status')
        if new_status:
            current_status = order[1]

            if new_status == 'restore':
                cur.execute("SELECT previous_status FROM wholesale_orders WHERE id = %s", (order_id,))
                prev = cur.fetchone()[0] or 'new'
                cur.execute(
                    "UPDATE wholesale_orders SET status = %s, previous_status = NULL, is_restored = true WHERE id = %s",
                    (prev, order_id)
                )
            else:
                allowed_statuses = ['new', 'confirmed', 'shipped', 'completed', 'archived']
                if new_status not in allowed_statuses:
                    cur.close()
                    conn.close()
                    return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Недопустимый статус'})}
                if new_status == 'archived':
                    cur.execute(
                        "UPDATE wholesale_orders SET status = 'archived', previous_status = %s WHERE id = %s",
                        (current_status, order_id)
                    )
                else:
                    if new_status == 'shipped':
                        cur.execute("SELECT payment_status FROM wholesale_orders WHERE id = %s", (order_id,))
                        ps = cur.fetchone()[0]
                        if ps == 'paid':
                            new_status = 'completed'
                    cur.execute("UPDATE wholesale_orders SET status = %s WHERE id = %s", (new_status, order_id))

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if method == 'DELETE':
        if not is_owner:
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Только владелец может удалять заявки'})}

        order_id = params.get('id')
        if not order_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан id заявки'})}

        cur.execute("DELETE FROM order_payments WHERE order_id = %s", (order_id,))
        cur.execute("DELETE FROM wholesale_order_items WHERE order_id = %s", (order_id,))
        cur.execute("DELETE FROM wholesale_orders WHERE id = %s", (order_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}