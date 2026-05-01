"""CRUD оптовых заявок: список, получение, инкрементальные операции с позициями."""
import json
import os
import re
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
ALLOWED_STATUSES = ['draft', 'new', 'confirmed', 'shipped', 'completed', 'archived']
TEMP_PRODUCT_ID = 19


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


def recalc_total(cur, order_id):
    cur.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM wholesale_order_items WHERE order_id = %s",
        (order_id,)
    )
    total = cur.fetchone()[0] or 0
    cur.execute("UPDATE wholesale_orders SET total_amount = %s WHERE id = %s", (total, order_id))
    return float(total)


def insert_item(cur, order_id, item, customer_name):
    qty = int(item.get('quantity', 1))
    price = float(item.get('price', 0) or 0)
    pid = item.get('product_id') or TEMP_PRODUCT_ID
    if price == 0 and pid != TEMP_PRODUCT_ID:
        price = calc_price_by_rules(cur, customer_name, pid)
    amount = price * qty
    temp_pid = item.get('temp_product_id')
    item_name = item.get('name')
    from_bulk = bool(item.get('from_bulk'))
    cur.execute(
        """INSERT INTO wholesale_order_items
           (order_id, product_id, quantity, price, amount, temp_product_id, item_name, from_bulk)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (order_id, pid, qty, price, amount, temp_pid, item_name, from_bulk)
    )
    return cur.fetchone()[0], float(price), float(amount)


def fetch_item_view(cur, item_id):
    cur.execute(
        """SELECT oi.id, oi.product_id, p.name, p.article, oi.quantity, oi.price, oi.amount,
                  oi.temp_product_id, oi.item_name, oi.from_bulk,
                  tp.brand, tp.article, tp.nomenclature_id,
                  np.name, np.article, np.brand
           FROM wholesale_order_items oi
           JOIN products p ON p.id = oi.product_id
           LEFT JOIN temp_products tp ON tp.id = oi.temp_product_id
           LEFT JOIN products np ON np.id = tp.nomenclature_id
           WHERE oi.id = %s""",
        (item_id,)
    )
    r = cur.fetchone()
    if not r:
        return None
    is_temp = r[7] is not None or r[1] == TEMP_PRODUCT_ID
    tp_brand, tp_article, tp_nom_id = r[10], r[11], r[12]
    np_name, np_article, _ = r[13], r[14], r[15]
    if is_temp:
        if tp_nom_id and np_name:
            display_name, display_article = np_name, np_article
        elif tp_brand or tp_article:
            display_name = f"{tp_brand or ''} {tp_article or ''}".strip()
            display_article = tp_article
        else:
            display_name = r[8] or r[2]
            display_article = None
    else:
        display_name = r[2]
        display_article = r[3] if r[3] != '__TEMP__' else None
    return {
        'id': r[0],
        'product_id': r[1] if r[1] != TEMP_PRODUCT_ID else None,
        'name': display_name,
        'article': display_article,
        'quantity': r[4],
        'price': float(r[5]),
        'amount': float(r[6]),
        'is_temp': is_temp,
        'temp_product_id': r[7],
        'has_uuid': False if is_temp else bool(r[3]),
        'from_bulk': bool(r[9]),
    }


def json_resp(status, body, extra_headers=None):
    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    if extra_headers:
        headers.update(extra_headers)
    return {'statusCode': status, 'headers': headers, 'body': json.dumps(body)}


def handler(event: dict, context) -> dict:
    """Управление оптовыми заявками: список, чтение, создание, инкрементальные операции с позициями."""
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

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')

    req_headers = event.get('headers', {})
    auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()
    try:
        user = get_user_by_token(cur, token)
        if not user:
            return json_resp(401, {'error': 'Не авторизован'})

        user_id, user_phone, user_role = user
        is_owner = user_role == 'owner'

        manager_id = None
        role_name = None
        if not is_owner:
            mgr = get_manager_info(cur, user_phone)
            if not mgr:
                return json_resp(403, {'error': 'Нет доступа'})
            manager_id, _, role_name = mgr
            if role_name not in ALLOWED_ROLES:
                return json_resp(403, {'error': 'Нет доступа к заявкам'})

        if method == 'GET':
            order_id = params.get('id')
            if order_id:
                cur.execute(
                    """SELECT o.id, o.customer_name, o.comment, o.status, o.total_amount,
                              o.created_at, m.first_name, m.last_name, o.payment_status, o.paid_amount, o.is_restored,
                              o.created_by_owner, o.created_by
                       FROM wholesale_orders o
                       JOIN managers m ON m.id = o.created_by
                       WHERE o.id = %s""",
                    (order_id,)
                )
                row = cur.fetchone()
                if not row:
                    return json_resp(404, {'error': 'Заявка не найдена'})

                cur.execute(
                    """SELECT oi.id, oi.product_id, p.name, p.article, oi.quantity, oi.price, oi.amount,
                              oi.temp_product_id, oi.item_name, oi.from_bulk,
                              tp.brand, tp.article, tp.nomenclature_id,
                              np.name, np.article, np.brand
                       FROM wholesale_order_items oi
                       JOIN products p ON p.id = oi.product_id
                       LEFT JOIN temp_products tp ON tp.id = oi.temp_product_id
                       LEFT JOIN products np ON np.id = tp.nomenclature_id
                       WHERE oi.order_id = %s
                       ORDER BY oi.id""",
                    (order_id,)
                )
                items = []
                for r in cur.fetchall():
                    is_temp = r[7] is not None or r[1] == TEMP_PRODUCT_ID
                    tp_brand, tp_article, tp_nom_id = r[10], r[11], r[12]
                    np_name, np_article, _ = r[13], r[14], r[15]
                    if is_temp:
                        if tp_nom_id and np_name:
                            display_name, display_article = np_name, np_article
                        elif tp_brand or tp_article:
                            display_name = f"{tp_brand or ''} {tp_article or ''}".strip()
                            display_article = tp_article
                        else:
                            display_name = r[8] or r[2]
                            display_article = None
                    else:
                        display_name = r[2]
                        display_article = r[3] if r[3] != '__TEMP__' else None
                    items.append({
                        'id': r[0],
                        'product_id': r[1] if r[1] != TEMP_PRODUCT_ID else None,
                        'name': display_name,
                        'article': display_article,
                        'quantity': r[4],
                        'price': float(r[5]),
                        'amount': float(r[6]),
                        'is_temp': is_temp,
                        'temp_product_id': r[7],
                        'has_uuid': False if is_temp else bool(r[3]),
                        'from_bulk': bool(r[9]),
                    })

                created_by_str = "Владелец" if row[11] else f"{row[6]} {row[7]}"
                order = {
                    'id': row[0], 'customer_name': row[1], 'comment': row[2],
                    'status': row[3], 'total_amount': float(row[4]),
                    'created_at': str(row[5]), 'created_by': created_by_str,
                    'created_by_id': row[12],
                    'payment_status': row[8], 'paid_amount': float(row[9]),
                    'is_restored': row[10],
                    'items': items,
                }
                return json_resp(200, {'order': order})

            status_filter = params.get('status')
            include_archived = params.get('include_archived') == '1'
            only_my_drafts = params.get('my_drafts') == '1'

            conditions = []
            values = []
            if only_my_drafts:
                conditions.append("o.status = 'draft'")
                if not is_owner:
                    conditions.append("o.created_by = %s AND o.created_by_owner = false")
                    values.append(manager_id)
                else:
                    conditions.append("o.created_by_owner = true")
            elif status_filter:
                conditions.append("o.status = %s")
                values.append(status_filter)
            else:
                conditions.append("o.status != 'draft'")
                if not include_archived:
                    conditions.append("o.status != 'archived'")

            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

            cur.execute(
                f"""SELECT o.id, o.customer_name, o.comment, o.status, o.total_amount,
                           o.created_at, m.first_name, m.last_name, o.payment_status, o.paid_amount, o.is_restored,
                           EXISTS(SELECT 1 FROM wholesale_order_items i WHERE i.order_id = o.id AND (i.price IS NULL OR i.price = 0)) AS has_zero_price,
                           o.created_by_owner
                    FROM wholesale_orders o
                    JOIN managers m ON m.id = o.created_by
                    {where}
                    ORDER BY o.created_at DESC
                    LIMIT 100""",
                values
            )
            orders = []
            for r in cur.fetchall():
                created_by_str = "Владелец" if r[12] else f"{r[6]} {r[7]}"
                orders.append({
                    'id': r[0], 'customer_name': r[1], 'comment': r[2],
                    'status': r[3], 'total_amount': float(r[4]),
                    'created_at': str(r[5]), 'created_by': created_by_str,
                    'payment_status': r[8], 'paid_amount': float(r[9]),
                    'is_restored': r[10], 'has_zero_price': bool(r[11]),
                })
            return json_resp(200, {'orders': orders})

        if method == 'POST':
            if not is_owner and role_name not in CAN_CREATE_ROLES:
                return json_resp(403, {'error': 'Нет прав на создание заявок'})

            owner_manager_id = manager_id
            if is_owner:
                cur.execute("SELECT id FROM managers ORDER BY id LIMIT 1")
                row = cur.fetchone()
                if not row:
                    return json_resp(400, {'error': 'Нет ни одного менеджера в системе'})
                owner_manager_id = row[0]

            action = body.get('action')

            # Создание пустой заявки-черновика. Возвращает id.
            if action == 'create_draft':
                cur.execute(
                    """INSERT INTO wholesale_orders
                       (customer_name, comment, total_amount, created_by, created_by_owner, status)
                       VALUES (%s, %s, 0, %s, %s, 'draft') RETURNING id""",
                    ('', None, owner_manager_id, bool(is_owner))
                )
                order_id = cur.fetchone()[0]
                conn.commit()
                return json_resp(201, {'id': order_id})

            # Добавление одной позиции к существующей заявке.
            if action == 'add_item':
                order_id = body.get('order_id')
                item = body.get('item') or {}
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                cur.execute("SELECT customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
                ord_row = cur.fetchone()
                if not ord_row:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                cname = ord_row[0] or ''
                item_id, _, _ = insert_item(cur, order_id, item, cname)
                total = recalc_total(cur, order_id)
                view = fetch_item_view(cur, item_id)
                conn.commit()
                return json_resp(201, {'item': view, 'total_amount': total})

            # Массовое добавление позиций (bulk paste, скан камерой).
            if action == 'add_items_batch':
                order_id = body.get('order_id')
                items = body.get('items') or []
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                if not items:
                    return json_resp(400, {'error': 'Список позиций пуст'})
                cur.execute("SELECT customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
                ord_row = cur.fetchone()
                if not ord_row:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                cname = ord_row[0] or ''
                created_ids = []
                for it in items:
                    iid, _, _ = insert_item(cur, order_id, it, cname)
                    created_ids.append(iid)
                total = recalc_total(cur, order_id)
                views = [fetch_item_view(cur, i) for i in created_ids]
                conn.commit()
                return json_resp(201, {'items': views, 'total_amount': total})

            # Обновление количества/цены одной позиции.
            if action == 'update_item':
                item_id = body.get('item_id')
                if not item_id:
                    return json_resp(400, {'error': 'Не указан item_id'})
                cur.execute("SELECT order_id, quantity, price FROM wholesale_order_items WHERE id = %s", (item_id,))
                row = cur.fetchone()
                if not row:
                    return json_resp(404, {'error': 'Позиция не найдена'})
                order_id, cur_qty, cur_price = row
                qty = int(body.get('quantity', cur_qty))
                price = float(body.get('price', cur_price))
                amount = qty * price
                cur.execute(
                    "UPDATE wholesale_order_items SET quantity = %s, price = %s, amount = %s WHERE id = %s",
                    (qty, price, amount, item_id)
                )
                total = recalc_total(cur, order_id)
                conn.commit()
                return json_resp(200, {'ok': True, 'amount': float(amount), 'total_amount': total})

            # Удаление одной позиции.
            if action == 'delete_item':
                item_id = body.get('item_id')
                if not item_id:
                    return json_resp(400, {'error': 'Не указан item_id'})
                cur.execute("SELECT order_id FROM wholesale_order_items WHERE id = %s", (item_id,))
                row = cur.fetchone()
                if not row:
                    return json_resp(404, {'error': 'Позиция не найдена'})
                order_id = row[0]
                cur.execute("DELETE FROM wholesale_order_items WHERE id = %s", (item_id,))
                total = recalc_total(cur, order_id)
                conn.commit()
                return json_resp(200, {'ok': True, 'total_amount': total})

            # Обновление шапки заявки (имя клиента, комментарий).
            if action == 'update_header':
                order_id = body.get('order_id')
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                fields = []
                vals = []
                if 'customer_name' in body:
                    cname = (body.get('customer_name') or '').strip()
                    fields.append("customer_name = %s")
                    vals.append(cname)
                    if cname:
                        cur.execute("INSERT INTO wholesalers (name) VALUES (%s) ON CONFLICT (name) DO NOTHING", (cname,))
                if 'comment' in body:
                    fields.append("comment = %s")
                    vals.append(body.get('comment'))
                if not fields:
                    return json_resp(400, {'error': 'Нет полей для обновления'})
                vals.append(order_id)
                cur.execute(f"UPDATE wholesale_orders SET {', '.join(fields)} WHERE id = %s", vals)
                conn.commit()
                return json_resp(200, {'ok': True})

            # Старое поведение — создание сразу с позициями (оставлено для обратной совместимости).
            customer_name = body.get('customer_name', '').strip()
            comment = (body.get('comment') or '').strip() or None
            items = body.get('items', [])

            if not customer_name:
                return json_resp(400, {'error': 'Укажите имя оптовика'})
            if not items:
                return json_resp(400, {'error': 'Добавьте хотя бы одну позицию'})

            cur.execute(
                """INSERT INTO wholesale_orders
                   (customer_name, comment, total_amount, created_by, created_by_owner)
                   VALUES (%s, %s, 0, %s, %s) RETURNING id""",
                (customer_name, comment, owner_manager_id, bool(is_owner))
            )
            order_id = cur.fetchone()[0]
            cur.execute("INSERT INTO wholesalers (name) VALUES (%s) ON CONFLICT (name) DO NOTHING", (customer_name,))
            for item in items:
                insert_item(cur, order_id, item, customer_name)
            recalc_total(cur, order_id)
            conn.commit()
            return json_resp(201, {'id': order_id})

        if method == 'PUT':
            order_id = params.get('id')
            if not order_id:
                return json_resp(400, {'error': 'Не указан id заявки'})

            cur.execute("SELECT id, status FROM wholesale_orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            if not order:
                return json_resp(404, {'error': 'Заявка не найдена'})

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
                    if new_status not in ALLOWED_STATUSES:
                        return json_resp(400, {'error': 'Недопустимый статус'})
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
                return json_resp(200, {'ok': True})

            return json_resp(400, {'error': 'PUT поддерживает только смену статуса'})

        if method == 'DELETE':
            order_id = params.get('id')
            if not order_id:
                return json_resp(400, {'error': 'Не указан id заявки'})

            cur.execute("SELECT status, created_by, created_by_owner FROM wholesale_orders WHERE id = %s", (order_id,))
            row = cur.fetchone()
            if not row:
                return json_resp(404, {'error': 'Заявка не найдена'})
            ord_status, ord_creator, ord_owner_flag = row

            allowed = is_owner
            if not allowed and ord_status == 'draft':
                allowed = (ord_creator == manager_id and not ord_owner_flag)
            if not allowed:
                return json_resp(403, {'error': 'Недостаточно прав для удаления'})

            cur.execute("DELETE FROM order_payments WHERE order_id = %s", (order_id,))
            cur.execute("DELETE FROM wholesale_order_items WHERE order_id = %s", (order_id,))
            cur.execute("DELETE FROM wholesale_orders WHERE id = %s", (order_id,))
            conn.commit()
            return json_resp(200, {'ok': True})

        return json_resp(405, {'error': 'Метод не поддерживается'})
    finally:
        cur.close()
        conn.close()
