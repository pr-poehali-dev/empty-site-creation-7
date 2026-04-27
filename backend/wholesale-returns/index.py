"""CRUD оптовых возвратов"""
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

def handler(event: dict, context) -> dict:
    """CRUD оптовых возвратов: список, создание, обновление позиций/статусов, удаление"""
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
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет доступа к возвратам'})}

    if method == 'GET':
        return_id = params.get('id')
        if return_id:
            cur.execute(
                """SELECT r.id, r.customer_name, r.comment, r.status, r.total_amount,
                          r.created_at, r.accepted_at, m.first_name, m.last_name
                   FROM wholesale_returns r
                   JOIN managers m ON m.id = r.created_by
                   WHERE r.id = %s""",
                (return_id,)
            )
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Возврат не найден'})}

            cur.execute(
                """SELECT ri.id, ri.product_id, p.name, p.article, ri.quantity, ri.price, ri.amount,
                          ri.temp_product_id, ri.item_name, ri.from_bulk,
                          tp.brand, tp.article, tp.nomenclature_id,
                          np.name, np.article, np.brand
                   FROM wholesale_return_items ri
                   JOIN products p ON p.id = ri.product_id
                   LEFT JOIN temp_products tp ON tp.id = ri.temp_product_id
                   LEFT JOIN products np ON np.id = tp.nomenclature_id
                   WHERE ri.return_id = %s
                   ORDER BY ri.id""",
                (return_id,)
            )
            items = []
            for r in cur.fetchall():
                is_temp = r[7] is not None or r[1] == 19
                tp_brand, tp_article, tp_nom_id = r[10], r[11], r[12]
                np_name, np_article, np_brand = r[13], r[14], r[15]
                if is_temp:
                    if tp_nom_id and np_name:
                        display_name = np_name
                        display_article = np_article
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
                    'id': r[0], 'product_id': r[1] if r[1] != 19 else None, 'name': display_name,
                    'article': display_article,
                    'quantity': r[4], 'price': float(r[5]), 'amount': float(r[6]),
                    'is_temp': is_temp, 'temp_product_id': r[7], 'has_uuid': False if is_temp else bool(r[3]),
                    'from_bulk': bool(r[9])
                })

            ret = {
                'id': row[0], 'customer_name': row[1], 'comment': row[2],
                'status': row[3], 'total_amount': float(row[4]),
                'created_at': str(row[5]),
                'accepted_at': str(row[6]) if row[6] else None,
                'created_by': f"{row[7]} {row[8]}",
                'items': items
            }
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'return': ret})}

        status_filter = params.get('status')
        include_archived = params.get('include_archived') == '1'
        conditions = []
        values = []
        if status_filter:
            conditions.append("r.status = %s")
            values.append(status_filter)
        elif not include_archived:
            conditions.append("r.status != 'archived'")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        cur.execute(
            f"""SELECT r.id, r.customer_name, r.comment, r.status, r.total_amount,
                       r.created_at, r.accepted_at, m.first_name, m.last_name,
                       COALESCE((SELECT SUM(op.amount) FROM order_payments op
                                 WHERE op.return_id = r.id AND op.method = 'return_offset'), 0) AS used
                FROM wholesale_returns r
                JOIN managers m ON m.id = r.created_by
                {where}
                ORDER BY r.created_at DESC LIMIT 200""",
            tuple(values) if values else None
        )
        returns = []
        for r in cur.fetchall():
            used = float(r[9])
            total = float(r[4])
            returns.append({
                'id': r[0], 'customer_name': r[1], 'comment': r[2],
                'status': r[3], 'total_amount': total,
                'created_at': str(r[5]),
                'accepted_at': str(r[6]) if r[6] else None,
                'created_by': f"{r[7]} {r[8]}",
                'used_amount': used,
                'remaining_amount': max(0.0, round(total - used, 2))
            })
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'returns': returns})}

    if method == 'POST':
        if not is_owner and role_name not in CAN_CREATE_ROLES:
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав на создание возвратов'})}

        # Для владельца используем id любого менеджера (created_by NOT NULL),
        # фактический автор-владелец будет отображаться корректно ниже.
        if is_owner:
            cur.execute("SELECT id FROM managers ORDER BY id LIMIT 1")
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нет ни одного менеджера в системе'})}
            manager_id = row[0]

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
            amount = price * int(item.get('quantity', 0))
            item['_price'] = price
            total += amount

        cur.execute(
            """INSERT INTO wholesale_returns (customer_name, comment, total_amount, created_by)
               VALUES (%s, %s, %s, %s) RETURNING id""",
            (customer_name, comment, total, manager_id)
        )
        return_id = cur.fetchone()[0]

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
                """INSERT INTO wholesale_return_items (return_id, product_id, quantity, price, amount, temp_product_id, item_name, from_bulk)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (return_id, pid, qty, price, amount, temp_pid, item_name, from_bulk)
            )

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 201, 'headers': headers, 'body': json.dumps({'id': return_id})}

    if method == 'PUT':
        return_id = params.get('id')
        if not return_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан id возврата'})}

        cur.execute("SELECT id, status FROM wholesale_returns WHERE id = %s", (return_id,))
        ret = cur.fetchone()
        if not ret:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Возврат не найден'})}

        customer_name = body.get('customer_name')
        comment_val = body.get('comment')
        items = body.get('items')
        new_status = body.get('status')

        # Защита от изменения позиций после принятия с активными зачётами
        if items is not None:
            cur.execute(
                "SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE return_id = %s AND method = 'return_offset'",
                (return_id,)
            )
            used = float(cur.fetchone()[0])
            if used > 0:
                cur.close()
                conn.close()
                return {'statusCode': 400, 'headers': headers,
                        'body': json.dumps({'error': 'Нельзя изменить позиции: возврат уже зачтён в заявки'})}

        if customer_name is not None:
            cur.execute("UPDATE wholesale_returns SET customer_name = %s WHERE id = %s", (customer_name.strip(), return_id))
            cur.execute("INSERT INTO wholesalers (name) VALUES (%s) ON CONFLICT (name) DO NOTHING", (customer_name.strip(),))
        if 'comment' in body:
            cur.execute("UPDATE wholesale_returns SET comment = %s WHERE id = %s", (comment_val, return_id))

        if items is not None:
            cur.execute("DELETE FROM wholesale_return_items WHERE return_id = %s", (return_id,))
            TEMP_PRODUCT_ID = 19
            total = 0
            for item in items:
                qty = int(item.get('quantity', 1))
                price = float(item.get('price', 0))
                pid = item.get('product_id') or TEMP_PRODUCT_ID
                amount = price * qty
                total += amount
                temp_pid = item.get('temp_product_id')
                item_name = item.get('name')
                from_bulk = bool(item.get('from_bulk'))
                cur.execute(
                    "INSERT INTO wholesale_return_items (return_id, product_id, quantity, price, amount, temp_product_id, item_name, from_bulk) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (return_id, pid, qty, price, amount, temp_pid, item_name, from_bulk)
                )
            cur.execute("UPDATE wholesale_returns SET total_amount = %s WHERE id = %s", (total, return_id))

        if new_status:
            current_status = ret[1]
            allowed_statuses = ['draft', 'confirmed', 'accepted', 'archived']
            if new_status not in allowed_statuses:
                cur.close()
                conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Недопустимый статус'})}

            # Откат с accepted: проверяем, не зачтён ли уже возврат в заявки
            if current_status == 'accepted' and new_status != 'accepted':
                cur.execute(
                    "SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE return_id = %s AND method = 'return_offset'",
                    (return_id,)
                )
                used = float(cur.fetchone()[0])
                if used > 0:
                    cur.close()
                    conn.close()
                    return {'statusCode': 400, 'headers': headers,
                            'body': json.dumps({'error': 'Нельзя откатить статус: возврат уже зачтён в заявки. Сначала удалите зачёты.'})}

            if new_status == 'accepted':
                cur.execute("UPDATE wholesale_returns SET status = 'accepted', accepted_at = NOW() WHERE id = %s", (return_id,))
            else:
                cur.execute("UPDATE wholesale_returns SET status = %s WHERE id = %s", (new_status, return_id))

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if method == 'DELETE':
        if not is_owner:
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Только владелец может удалять возвраты'})}

        return_id = params.get('id')
        if not return_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан id возврата'})}

        # Если есть зачёты — нельзя удалить
        cur.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE return_id = %s AND method = 'return_offset'",
            (return_id,)
        )
        used = float(cur.fetchone()[0])
        if used > 0:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'error': 'Нельзя удалить: возврат зачтён в заявки'})}

        cur.execute("DELETE FROM wholesale_return_items WHERE return_id = %s", (return_id,))
        cur.execute("DELETE FROM wholesale_returns WHERE id = %s", (return_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}