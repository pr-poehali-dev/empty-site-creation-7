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
    cur.execute(
        "SELECT price_base, price_retail, price_wholesale, price_purchase, product_group FROM products WHERE id = %s",
        (product_id,)
    )
    prod = cur.fetchone()
    if not prod:
        return 0
    price_map = {'price_base': prod[0], 'price_retail': prod[1], 'price_wholesale': prod[2], 'price_purchase': prod[3]}
    if not rules:
        return float(price_map.get('price_wholesale') or 0)
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
    cur.execute(
        "UPDATE wholesale_orders SET total_amount = %s, updated_at = NOW() WHERE id = %s RETURNING updated_at",
        (total, order_id)
    )
    new_updated_at = cur.fetchone()[0]
    return float(total), str(new_updated_at)


def touch_order(cur, order_id):
    cur.execute(
        "UPDATE wholesale_orders SET updated_at = NOW() WHERE id = %s RETURNING updated_at",
        (order_id,)
    )
    row = cur.fetchone()
    return str(row[0]) if row else None


def get_order_version(cur, order_id):
    cur.execute("SELECT updated_at FROM wholesale_orders WHERE id = %s", (order_id,))
    row = cur.fetchone()
    return str(row[0]) if row else None


def is_recalc_locked(cur, order_id):
    cur.execute(
        "SELECT recalc_in_progress, recalc_started_at FROM wholesale_orders WHERE id = %s",
        (order_id,)
    )
    row = cur.fetchone()
    if not row or not row[0]:
        return False
    started_at = row[1]
    if started_at:
        cur.execute("SELECT NOW() - %s > INTERVAL '5 minutes'", (started_at,))
        is_stale = cur.fetchone()[0]
        if is_stale:
            cur.execute(
                "UPDATE wholesale_orders SET recalc_in_progress = FALSE, recalc_started_at = NULL WHERE id = %s",
                (order_id,)
            )
            return False
    return True


LOCK_STALE_MINUTES = 5


def get_lock_info(cur, order_id):
    """Возвращает текущую информацию о блокировке заявки.
    locked_by_users_id — id из users (уникален у каждого пользователя, в т.ч. владельца)."""
    cur.execute(
        """SELECT o.locked_by_users_id, o.locked_at, o.locked_session_id,
                  u.role, u.phone, m.first_name, m.last_name,
                  NOW() - o.locked_at > INTERVAL '5 minutes'
           FROM wholesale_orders o
           LEFT JOIN users u ON u.id = o.locked_by_users_id
           LEFT JOIN managers m ON m.phone = u.phone AND u.role <> 'owner'
           WHERE o.id = %s""",
        (order_id,)
    )
    row = cur.fetchone()
    if not row:
        return None
    locked_by_users_id, locked_at, session_id, u_role, _u_phone, first_name, last_name, is_stale = row
    if locked_by_users_id is None:
        return {'locked': False}
    if is_stale:
        cur.execute(
            "UPDATE wholesale_orders SET locked_by_users_id = NULL, locked_at = NULL, locked_session_id = NULL WHERE id = %s",
            (order_id,)
        )
        return {'locked': False}
    if u_role == 'owner':
        name = 'Владелец'
    else:
        name = f"{first_name or ''} {last_name or ''}".strip() or 'Пользователь'
    return {
        'locked': True,
        'locked_by_users_id': locked_by_users_id,
        'locked_by_name': name,
        'locked_at': str(locked_at),
        'locked_session_id': session_id,
    }


def check_lock_owner(cur, order_id, current_users_id, session_id):
    """Проверяет что текущий пользователь+сессия владеют блокировкой.
    Если блокировки нет — автоматически захватывает её для текущего пользователя (lazy lock).
    Возвращает (ok: bool, info: dict|None)."""
    info = get_lock_info(cur, order_id)
    if info is None:
        return False, None
    if not info.get('locked'):
        # Lock свободен — захватываем сами (lazy)
        cur.execute(
            "UPDATE wholesale_orders SET locked_by_users_id = %s, locked_session_id = %s, locked_at = NOW() WHERE id = %s",
            (current_users_id, session_id or '', order_id)
        )
        log_lock_action(cur, order_id, current_users_id, session_id, 'lazy_lock', 'auto_on_mutation')
        new_info = get_lock_info(cur, order_id)
        return True, new_info
    if info.get('locked_by_users_id') != current_users_id:
        return False, info
    if session_id and info.get('locked_session_id') != session_id:
        return False, info
    return True, info


def log_lock_action(cur, order_id, manager_id, session_id, action, reason=None):
    try:
        cur.execute(
            "INSERT INTO order_lock_history (order_id, user_id, session_id, action, reason) VALUES (%s, %s, %s, %s, %s)",
            (order_id, manager_id, session_id or '', action, reason)
        )
    except Exception:
        pass


def check_version(cur, order_id, expected_version):
    current = get_order_version(cur, order_id)
    if current is None:
        return False, None
    if not expected_version:
        return True, current
    return str(current) == str(expected_version), current


def insert_item(cur, order_id, item, customer_name, actor='4'):
    qty = int(item.get('quantity', 1))
    price = float(item.get('price', 0) or 0)
    pid = item.get('product_id') or TEMP_PRODUCT_ID
    if price == 0 and pid != TEMP_PRODUCT_ID:
        price = calc_price_by_rules(cur, customer_name, pid)
    amount = price * qty
    temp_pid = item.get('temp_product_id')
    item_name = item.get('name')
    from_bulk = bool(item.get('from_bulk'))
    was_restored = bool(item.get('was_restored'))
    cur.execute(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM wholesale_order_items WHERE order_id = %s",
        (order_id,)
    )
    sort_order = cur.fetchone()[0]
    restored_by = actor if was_restored else None
    created_by = item.get('preserve_created_by') or actor
    qty_changed_by = item.get('preserve_qty_changed_by') or actor
    price_changed_by = item.get('preserve_price_changed_by') or actor
    cur.execute(
        """INSERT INTO wholesale_order_items
           (order_id, product_id, quantity, price, amount, temp_product_id, item_name, from_bulk, sort_order, was_restored,
            created_by, qty_changed_by, price_changed_by, restored_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (order_id, pid, qty, price, amount, temp_pid, item_name, from_bulk, sort_order, was_restored,
         created_by, qty_changed_by, price_changed_by, restored_by)
    )
    return cur.fetchone()[0], float(price), float(amount)


def fetch_item_view(cur, item_id):
    cur.execute(
        """SELECT oi.id, oi.product_id, p.name, p.article, oi.quantity, oi.price, oi.amount,
                  oi.temp_product_id, oi.item_name, oi.from_bulk,
                  tp.brand, tp.article, tp.nomenclature_id,
                  np.name, np.article, np.brand, oi.was_restored,
                  oi.created_by, oi.qty_changed_by, oi.price_changed_by, oi.restored_by
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
        'was_restored': bool(r[16]),
        'created_by': r[17],
        'qty_changed_by': r[18],
        'price_changed_by': r[19],
        'restored_by': r[20],
    }


def load_rules_for_customer(cur, customer_name):
    cur.execute("SELECT id FROM wholesalers WHERE name = %s", (customer_name,))
    w = cur.fetchone()
    if not w:
        return []
    cur.execute(
        """SELECT filter_type, filter_value, price_field, formula,
                  condition_price_field, condition_operator, condition_value
           FROM pricing_rules WHERE wholesaler_id = %s ORDER BY priority""",
        (w[0],)
    )
    return cur.fetchall()


def calc_price_in_memory(prod, rules):
    price_map = {
        'price_base': prod['price_base'], 'price_retail': prod['price_retail'],
        'price_wholesale': prod['price_wholesale'], 'price_purchase': prod['price_purchase'],
    }
    if not rules:
        return float(price_map.get('price_wholesale') or 0)
    matched = None
    for r in rules:
        if r[0] == 'product_group' and prod['product_group'] == r[1]:
            if check_condition(price_map, r[4], r[5], r[6]):
                matched = r
                break
    if not matched:
        return float(price_map.get('price_wholesale') or 0)
    base = float(price_map.get(matched[2]) or 0)
    return apply_formula(base, matched[3])


def collect_recalc_targets(cur, order_id, group, brand, overwrite_manual):
    """Возвращает список позиций заявки под условие (группа/бренд) с текущей и новой ценой.
    Фильтр: если заданы и group и brand — совпадать должны оба. Временные позиции пропускаются."""
    cur.execute(
        """SELECT oi.id, oi.product_id, oi.quantity, oi.price, oi.price_changed_by,
                  p.product_group, p.brand,
                  p.price_base, p.price_retail, p.price_wholesale, p.price_purchase
           FROM wholesale_order_items oi
           JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = %s AND oi.temp_product_id IS NULL
             AND oi.product_id IS NOT NULL AND oi.product_id <> %s""",
        (order_id, TEMP_PRODUCT_ID)
    )
    rows = cur.fetchall()
    cur.execute("SELECT customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
    crow = cur.fetchone()
    customer_name = (crow[0] if crow else '') or ''
    rules = load_rules_for_customer(cur, customer_name)
    targets = []
    for r in rows:
        item_id, pid, qty, price, price_changed_by = r[0], r[1], r[2], r[3], r[4]
        p_group, p_brand = r[5], r[6]
        if group and (p_group or '') != group:
            continue
        if brand and (p_brand or '') != brand:
            continue
        if (not overwrite_manual) and price_changed_by and price_changed_by not in ('', 'Ф'):
            is_manual = True
        else:
            is_manual = False
        prod = {
            'price_base': r[7], 'price_retail': r[8],
            'price_wholesale': r[9], 'price_purchase': r[10],
            'product_group': p_group,
        }
        new_price = calc_price_in_memory(prod, rules)
        targets.append({
            'item_id': item_id, 'quantity': int(qty or 0),
            'old_price': float(price or 0), 'new_price': float(new_price or 0),
            'is_manual': is_manual,
        })
    return targets


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

        actor = 'Ф' if is_owner else str(manager_id)

        if method == 'GET':
            order_id = params.get('id')
            if order_id:
                cur.execute(
                    """SELECT o.id, o.customer_name, o.comment, o.status, o.total_amount,
                              o.created_at, m.first_name, m.last_name, o.payment_status, o.paid_amount, o.is_restored,
                              o.created_by_owner, o.created_by, o.recalc_in_progress
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
                              np.name, np.article, np.brand, oi.was_restored,
                              oi.created_by, oi.qty_changed_by, oi.price_changed_by, oi.restored_by
                       FROM wholesale_order_items oi
                       JOIN products p ON p.id = oi.product_id
                       LEFT JOIN temp_products tp ON tp.id = oi.temp_product_id
                       LEFT JOIN products np ON np.id = tp.nomenclature_id
                       WHERE oi.order_id = %s
                       ORDER BY oi.sort_order DESC""",
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
                        'was_restored': bool(r[16]),
                        'created_by': r[17],
                        'qty_changed_by': r[18],
                        'price_changed_by': r[19],
                        'restored_by': r[20],
                    })

                created_by_str = "Владелец" if row[11] else f"{row[6]} {row[7]}"
                version = get_order_version(cur, row[0])
                lock_info = get_lock_info(cur, row[0])
                if lock_info and lock_info.get('locked'):
                    lock_info = dict(lock_info)
                    lock_info['is_mine'] = (lock_info.get('locked_by_users_id') == user_id)
                order = {
                    'id': row[0], 'customer_name': row[1], 'comment': row[2],
                    'status': row[3], 'total_amount': float(row[4]),
                    'created_at': str(row[5]), 'created_by': created_by_str,
                    'created_by_id': row[12],
                    'payment_status': row[8], 'paid_amount': float(row[9]),
                    'is_restored': row[10],
                    'recalc_in_progress': bool(row[13]),
                    'version': version,
                    'lock': lock_info,
                    'items': items,
                }
                conn.commit()
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
                if include_archived:
                    conditions.append("o.status = 'archived'")
                else:
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

            # Лёгкий запрос версии заявки (для polling).
            if action == 'get_version':
                order_id = body.get('order_id')
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                v = get_order_version(cur, order_id)
                if v is None:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                return json_resp(200, {'version': v})

            # Превью пересчёта цен по группе/бренду (ничего не меняет).
            if action == 'recalc_preview':
                order_id = body.get('order_id')
                group = (body.get('group') or '').strip() or None
                brand = (body.get('brand') or '').strip() or None
                overwrite_manual = bool(body.get('overwrite_manual'))
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                if not group and not brand:
                    return json_resp(400, {'error': 'Укажите группу или бренд'})
                try:
                    targets = collect_recalc_targets(cur, order_id, group, brand, overwrite_manual)
                except Exception as e:
                    import traceback
                    conn.rollback()
                    return json_resp(500, {'error': f'preview: {e}', 'tb': traceback.format_exc()[-500:]})
                affected = [t for t in targets if not t['is_manual']]
                count = len(affected)
                zero_count = sum(1 for t in affected if t['old_price'] == 0)
                sum_now = round(sum(t['old_price'] * t['quantity'] for t in affected), 2)
                sum_after = round(sum(t['new_price'] * t['quantity'] for t in affected), 2)
                manual_skipped = sum(1 for t in targets if t['is_manual'])
                conn.commit()
                return json_resp(200, {
                    'count': count, 'zero_count': zero_count,
                    'sum_now': sum_now, 'sum_after': sum_after,
                    'manual_skipped': manual_skipped,
                })

            # Применение пересчёта цен по группе/бренду.
            if action == 'recalc_apply':
                order_id = body.get('order_id')
                group = (body.get('group') or '').strip() or None
                brand = (body.get('brand') or '').strip() or None
                overwrite_manual = bool(body.get('overwrite_manual'))
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                if not group and not brand:
                    return json_resp(400, {'error': 'Укажите группу или бренд'})
                cur.execute("SELECT status FROM wholesale_orders WHERE id = %s", (order_id,))
                srow = cur.fetchone()
                if not srow:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                targets = collect_recalc_targets(cur, order_id, group, brand, overwrite_manual)
                updated = 0
                for t in targets:
                    if t['is_manual']:
                        continue
                    new_price = t['new_price']
                    amount = new_price * t['quantity']
                    cur.execute(
                        "UPDATE wholesale_order_items SET price = %s, amount = %s, price_changed_by = %s WHERE id = %s",
                        (new_price, amount, actor, t['item_id'])
                    )
                    updated += 1
                total, ver = recalc_total(cur, order_id)
                conn.commit()
                return json_resp(200, {'updated': updated, 'total_amount': total, 'version': ver})

            # Создание пустой заявки-черновика. Возвращает id и version.
            if action == 'create_draft':
                cur.execute(
                    """INSERT INTO wholesale_orders
                       (customer_name, comment, total_amount, created_by, created_by_owner, status)
                       VALUES (%s, %s, 0, %s, %s, 'draft') RETURNING id, updated_at""",
                    ('', None, owner_manager_id, bool(is_owner))
                )
                row = cur.fetchone()
                order_id, ver = row[0], str(row[1])
                conn.commit()
                return json_resp(201, {'id': order_id, 'version': ver})

            expected_version = body.get('expected_version')
            session_id = body.get('session_id') or ''

            # ===== Блокировка заявки (single-user lock) =====
            # Идентификация владельца блокировки идёт по users.id (уникальный для каждого пользователя,
            # включая владельца проекта — у него role='owner' и собственный users.id).
            # Захват блокировки: ставит lock на заявку текущему пользователю+сессии.
            if action == 'lock':
                order_id = body.get('order_id')
                force = bool(body.get('force'))
                if not order_id or not session_id:
                    return json_resp(400, {'error': 'Не указаны order_id или session_id'})
                cur.execute("SELECT id FROM wholesale_orders WHERE id = %s", (order_id,))
                if not cur.fetchone():
                    return json_resp(404, {'error': 'Заявка не найдена'})
                info = get_lock_info(cur, order_id)
                # Если уже залочено
                if info and info.get('locked'):
                    same_user = info.get('locked_by_users_id') == user_id
                    same_session = info.get('locked_session_id') == session_id
                    if same_user and same_session:
                        # Это мы — продлеваем
                        cur.execute(
                            "UPDATE wholesale_orders SET locked_at = NOW() WHERE id = %s",
                            (order_id,)
                        )
                        conn.commit()
                        return json_resp(200, {'ok': True, 'owner': 'self', 'lock': info})
                    if same_user and not same_session:
                        # Тот же юзер, другая вкладка
                        if force:
                            cur.execute(
                                "UPDATE wholesale_orders SET locked_session_id = %s, locked_at = NOW() WHERE id = %s",
                                (session_id, order_id)
                            )
                            log_lock_action(cur, order_id, user_id, session_id, 'force_takeover', 'same_user_other_tab')
                            conn.commit()
                            new_info = get_lock_info(cur, order_id)
                            return json_resp(200, {'ok': True, 'owner': 'self', 'lock': new_info})
                        return json_resp(200, {'ok': False, 'owner': 'self_other_tab', 'lock': info})
                    # Чужой пользователь
                    if force and is_owner:
                        cur.execute(
                            "UPDATE wholesale_orders SET locked_by_users_id = %s, locked_session_id = %s, locked_at = NOW() WHERE id = %s",
                            (user_id, session_id, order_id)
                        )
                        log_lock_action(cur, order_id, user_id, session_id, 'force_unlock_by_owner', 'admin')
                        conn.commit()
                        new_info = get_lock_info(cur, order_id)
                        return json_resp(200, {'ok': True, 'owner': 'self', 'lock': new_info, 'forced': True})
                    return json_resp(200, {'ok': False, 'owner': 'other', 'lock': info})
                # Свободно — захватываем
                cur.execute(
                    "UPDATE wholesale_orders SET locked_by_users_id = %s, locked_session_id = %s, locked_at = NOW() WHERE id = %s",
                    (user_id, session_id, order_id)
                )
                log_lock_action(cur, order_id, user_id, session_id, 'lock', None)
                conn.commit()
                new_info = get_lock_info(cur, order_id)
                return json_resp(200, {'ok': True, 'owner': 'self', 'lock': new_info})

            # Heartbeat — продление блокировки.
            if action == 'heartbeat':
                order_id = body.get('order_id')
                if not order_id or not session_id:
                    return json_resp(400, {'error': 'Не указаны order_id или session_id'})
                info = get_lock_info(cur, order_id)
                if not info or not info.get('locked'):
                    return json_resp(200, {'lost': True, 'reason': 'no_lock'})
                if info.get('locked_by_users_id') != user_id or info.get('locked_session_id') != session_id:
                    return json_resp(200, {'lost': True, 'reason': 'taken_by_other'})
                cur.execute(
                    "UPDATE wholesale_orders SET locked_at = NOW() WHERE id = %s",
                    (order_id,)
                )
                conn.commit()
                return json_resp(200, {'ok': True})

            # Unlock — освобождение блокировки текущей сессией.
            if action == 'unlock':
                order_id = body.get('order_id')
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                info = get_lock_info(cur, order_id)
                if info and info.get('locked'):
                    if info.get('locked_by_users_id') == user_id and (not session_id or info.get('locked_session_id') == session_id):
                        cur.execute(
                            "UPDATE wholesale_orders SET locked_by_users_id = NULL, locked_at = NULL, locked_session_id = NULL WHERE id = %s",
                            (order_id,)
                        )
                        log_lock_action(cur, order_id, user_id, session_id, 'unlock', None)
                        conn.commit()
                        return json_resp(200, {'ok': True})
                return json_resp(200, {'ok': True, 'noop': True})

            # Force unlock — снять блокировку (только владелец проекта).
            if action == 'force_unlock':
                if not is_owner:
                    return json_resp(403, {'error': 'Только владелец может принудительно снимать блокировки'})
                order_id = body.get('order_id')
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                cur.execute(
                    "UPDATE wholesale_orders SET locked_by_users_id = NULL, locked_at = NULL, locked_session_id = NULL WHERE id = %s",
                    (order_id,)
                )
                log_lock_action(cur, order_id, user_id, '', 'force_unlock_admin', 'owner_action')
                conn.commit()
                return json_resp(200, {'ok': True})

            # Пересчёт нулевых цен. Поддерживает многократные вызовы с {done:false} при большом объёме.
            if action == 'recalc_zero_prices':
                import traceback
                import sys
                import time as _time
                def rlog(msg):
                    print(f"[RECALC] {msg}", flush=True)
                    sys.stdout.flush()
                order_id = body.get('order_id')
                rlog(f"START order_id={order_id} actor={actor}")
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})

                MAX_SECONDS = 25.0
                BATCH_COMMIT = 50
                SLEEP_BETWEEN = 0.05

                started = _time.time()
                try:
                    cur.execute("SELECT customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
                    ord_row = cur.fetchone()
                    if not ord_row:
                        return json_resp(404, {'error': 'Заявка не найдена'})
                    cname = ord_row[0] or ''

                    # Поднимаем блокировку и проставляем heartbeat. Один коммит сразу,
                    # чтобы другие запросы видели TRUE и получали 423.
                    cur.execute(
                        "UPDATE wholesale_orders SET recalc_in_progress = TRUE, recalc_started_at = NOW() WHERE id = %s",
                        (order_id,)
                    )
                    conn.commit()
                    rlog("LOCK set TRUE + heartbeat")

                    # Загружаем правила оптовика ОДИН РАЗ.
                    cur.execute("SELECT id FROM wholesalers WHERE name = %s", (cname,))
                    wrow = cur.fetchone()
                    rules = []
                    if wrow:
                        cur.execute(
                            """SELECT filter_type, filter_value, price_field, formula,
                                      condition_price_field, condition_operator, condition_value
                               FROM pricing_rules WHERE wholesaler_id = %s ORDER BY priority""",
                            (wrow[0],)
                        )
                        rules = cur.fetchall()
                    rlog(f"loaded {len(rules)} rules for '{cname}'")

                    # Все нулевые позиции (с quantity сразу).
                    cur.execute(
                        """SELECT id, product_id, temp_product_id, quantity
                           FROM wholesale_order_items
                           WHERE order_id = %s AND (price IS NULL OR price = 0)
                           ORDER BY id""",
                        (order_id,)
                    )
                    zero_items = cur.fetchall()
                    total_zero = len(zero_items)
                    rlog(f"found {total_zero} zero items")
                    if total_zero == 0:
                        cur.execute(
                            "UPDATE wholesale_orders SET recalc_in_progress = FALSE, recalc_started_at = NULL WHERE id = %s",
                            (order_id,)
                        )
                        total, ver = recalc_total(cur, order_id)
                        conn.commit()
                        return json_resp(200, {'updated': 0, 'total_zero': 0, 'total_amount': total, 'version': ver, 'done': True})

                    # Грузим все товары пачкой.
                    pids = list({pid for (_iid, pid, tpid, _q) in zero_items if pid and pid != TEMP_PRODUCT_ID})
                    products = {}
                    if pids:
                        cur.execute(
                            """SELECT id, price_base, price_retail, price_wholesale, price_purchase, product_group
                               FROM products WHERE id = ANY(%s)""",
                            (pids,)
                        )
                        for r in cur.fetchall():
                            products[r[0]] = {
                                'price_base': r[1], 'price_retail': r[2],
                                'price_wholesale': r[3], 'price_purchase': r[4],
                                'product_group': r[5],
                            }
                    rlog(f"loaded {len(products)} products")

                    # Грузим временные товары пачкой.
                    tpids = list({tpid for (_iid, _p, tpid, _q) in zero_items if tpid})
                    temp_products = {}
                    if tpids:
                        cur.execute("SELECT id, price FROM temp_products WHERE id = ANY(%s)", (tpids,))
                        for r in cur.fetchall():
                            temp_products[r[0]] = r[1]
                    rlog(f"loaded {len(temp_products)} temp_products")

                    def calc_in_memory(pid):
                        prod = products.get(pid)
                        if not prod:
                            return 0.0
                        price_map = {
                            'price_base': prod['price_base'],
                            'price_retail': prod['price_retail'],
                            'price_wholesale': prod['price_wholesale'],
                            'price_purchase': prod['price_purchase'],
                        }
                        if not rules:
                            return float(price_map.get('price_wholesale') or 0)
                        matched = None
                        for r in rules:
                            if r[0] == 'product_group' and prod['product_group'] == r[1]:
                                if check_condition(price_map, r[4], r[5], r[6]):
                                    matched = r
                                    break
                        if not matched:
                            return float(price_map.get('price_wholesale') or 0)
                        base = float(price_map.get(matched[2]) or 0)
                        return apply_formula(base, matched[3])

                    updated_count = 0
                    processed = 0
                    batch_in_tx = 0
                    done_all = True
                    for idx, (item_id, pid, temp_pid, qty) in enumerate(zero_items):
                        if _time.time() - started > MAX_SECONDS:
                            rlog(f"TIME LIMIT at idx={idx}, will continue next call")
                            done_all = False
                            break
                        try:
                            new_price = 0.0
                            if temp_pid:
                                tp = temp_products.get(temp_pid)
                                if tp:
                                    new_price = float(tp)
                            elif pid and pid != TEMP_PRODUCT_ID:
                                new_price = calc_in_memory(pid)
                            if new_price > 0:
                                amount = float(new_price) * int(qty or 0)
                                # retry на rate limit
                                attempt = 0
                                while True:
                                    try:
                                        cur.execute(
                                            "UPDATE wholesale_order_items SET price = %s, amount = %s, price_changed_by = %s WHERE id = %s",
                                            (new_price, amount, actor, item_id)
                                        )
                                        break
                                    except Exception as upd_err:
                                        msg = str(upd_err).lower()
                                        if 'rate limit' in msg and attempt < 1:
                                            attempt += 1
                                            rlog(f"[{idx+1}] rate limit, retry after 2s")
                                            try:
                                                conn.rollback()
                                            except Exception:
                                                pass
                                            _time.sleep(2.0)
                                            continue
                                        raise
                                updated_count += 1
                                batch_in_tx += 1
                                if idx % 25 == 0:
                                    rlog(f"[{idx+1}/{total_zero}] item={item_id} price={new_price}")
                            processed += 1
                            # Коммит пачкой + heartbeat.
                            if batch_in_tx >= BATCH_COMMIT:
                                cur.execute(
                                    "UPDATE wholesale_orders SET recalc_started_at = NOW() WHERE id = %s",
                                    (order_id,)
                                )
                                conn.commit()
                                batch_in_tx = 0
                                rlog(f"COMMIT batch, updated_so_far={updated_count}")
                            _time.sleep(SLEEP_BETWEEN)
                        except Exception as item_err:
                            rlog(f"[{idx+1}] ITEM ERROR item_id={item_id}: {item_err}")
                            try:
                                conn.rollback()
                            except Exception:
                                pass
                            batch_in_tx = 0
                            # продолжаем со следующей позиции

                    # Финальный коммит остатка
                    if batch_in_tx > 0:
                        conn.commit()
                        rlog(f"COMMIT final batch, updated_total={updated_count}")

                    if done_all:
                        cur.execute(
                            "UPDATE wholesale_orders SET recalc_in_progress = FALSE, recalc_started_at = NULL WHERE id = %s",
                            (order_id,)
                        )
                        total, ver = recalc_total(cur, order_id)
                        conn.commit()
                        rlog(f"DONE updated={updated_count}/{total_zero}")
                        return json_resp(200, {'updated': updated_count, 'total_zero': total_zero, 'total_amount': total, 'version': ver, 'done': True})
                    else:
                        # Не успели — оставляем блокировку, фронт вызовет ещё раз
                        cur.execute(
                            "UPDATE wholesale_orders SET recalc_started_at = NOW() WHERE id = %s",
                            (order_id,)
                        )
                        total, ver = recalc_total(cur, order_id)
                        conn.commit()
                        rlog(f"PARTIAL processed={processed}/{total_zero} updated={updated_count}, continue")
                        return json_resp(200, {'updated': updated_count, 'total_zero': total_zero, 'total_amount': total, 'version': ver, 'done': False, 'processed': processed})

                except Exception as e:
                    rlog(f"FATAL ERROR order_id={order_id}: {e}\n{traceback.format_exc()}")
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                    return json_resp(500, {'error': f'Ошибка пересчёта: {e}'})

            # Старт пересчёта нулевых цен — блокирует заявку для всех остальных операций.
            if action == 'start_recalc':
                order_id = body.get('order_id')
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                cur.execute(
                    "UPDATE wholesale_orders SET recalc_in_progress = TRUE, updated_at = NOW() WHERE id = %s RETURNING updated_at",
                    (order_id,)
                )
                row = cur.fetchone()
                if not row:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                conn.commit()
                return json_resp(200, {'ok': True, 'version': str(row[0])})

            # Завершение пересчёта — снимает блокировку.
            if action == 'stop_recalc':
                order_id = body.get('order_id')
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                cur.execute(
                    "UPDATE wholesale_orders SET recalc_in_progress = FALSE, updated_at = NOW() WHERE id = %s RETURNING updated_at",
                    (order_id,)
                )
                row = cur.fetchone()
                if not row:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                conn.commit()
                return json_resp(200, {'ok': True, 'version': str(row[0])})

            # Добавление одной позиции к существующей заявке.
            if action == 'add_item':
                order_id = body.get('order_id')
                item = body.get('item') or {}
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                if is_recalc_locked(cur, order_id):
                    return json_resp(423, {'error': 'Идёт пересчёт цен, попробуйте позже'})
                ok_l, lock_info = check_lock_owner(cur, order_id, user_id, session_id)
                if not ok_l:
                    return json_resp(423, {'error': 'Заявка редактируется другим пользователем', 'lock': lock_info})
                ok_v, current_v = check_version(cur, order_id, expected_version)
                if current_v is None:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                if not ok_v:
                    return json_resp(409, {'error': 'Версия устарела', 'version': current_v})
                cur.execute("SELECT customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
                ord_row = cur.fetchone()
                cname = ord_row[0] or ''
                item_id, _, _ = insert_item(cur, order_id, item, cname, actor)
                total, ver = recalc_total(cur, order_id)
                view = fetch_item_view(cur, item_id)
                conn.commit()
                return json_resp(201, {'item': view, 'total_amount': total, 'version': ver})

            # Массовое добавление позиций (bulk paste, скан камерой).
            if action == 'add_items_batch':
                order_id = body.get('order_id')
                items = body.get('items') or []
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                if not items:
                    return json_resp(400, {'error': 'Список позиций пуст'})
                if is_recalc_locked(cur, order_id):
                    return json_resp(423, {'error': 'Идёт пересчёт цен, попробуйте позже'})
                ok_l, lock_info = check_lock_owner(cur, order_id, user_id, session_id)
                if not ok_l:
                    return json_resp(423, {'error': 'Заявка редактируется другим пользователем', 'lock': lock_info})
                ok_v, current_v = check_version(cur, order_id, expected_version)
                if current_v is None:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                if not ok_v:
                    return json_resp(409, {'error': 'Версия устарела', 'version': current_v})
                cur.execute("SELECT customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
                ord_row = cur.fetchone()
                cname = ord_row[0] or ''
                created_ids = []
                for it in items:
                    iid, _, _ = insert_item(cur, order_id, it, cname, actor)
                    created_ids.append(iid)
                total, ver = recalc_total(cur, order_id)
                views = [fetch_item_view(cur, i) for i in created_ids]
                conn.commit()
                return json_resp(201, {'items': views, 'total_amount': total, 'version': ver})

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
                if is_recalc_locked(cur, order_id):
                    return json_resp(423, {'error': 'Идёт пересчёт цен, попробуйте позже'})
                ok_l, lock_info = check_lock_owner(cur, order_id, user_id, session_id)
                if not ok_l:
                    return json_resp(423, {'error': 'Заявка редактируется другим пользователем', 'lock': lock_info})
                ok_v, current_v = check_version(cur, order_id, expected_version)
                if not ok_v:
                    return json_resp(409, {'error': 'Версия устарела', 'version': current_v})
                qty = int(body.get('quantity', cur_qty))
                price = float(body.get('price', cur_price))
                amount = qty * price
                qty_changed = qty != int(cur_qty)
                price_changed = float(price) != float(cur_price)
                set_fields = ["quantity = %s", "price = %s", "amount = %s"]
                set_vals = [qty, price, amount]
                if qty_changed:
                    set_fields.append("qty_changed_by = %s")
                    set_vals.append(actor)
                if price_changed:
                    set_fields.append("price_changed_by = %s")
                    set_vals.append(actor)
                set_vals.append(item_id)
                cur.execute(
                    f"UPDATE wholesale_order_items SET {', '.join(set_fields)} WHERE id = %s",
                    set_vals
                )
                total, ver = recalc_total(cur, order_id)
                conn.commit()
                return json_resp(200, {'ok': True, 'amount': float(amount), 'total_amount': total, 'version': ver})

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
                if is_recalc_locked(cur, order_id):
                    return json_resp(423, {'error': 'Идёт пересчёт цен, попробуйте позже'})
                ok_l, lock_info = check_lock_owner(cur, order_id, user_id, session_id)
                if not ok_l:
                    return json_resp(423, {'error': 'Заявка редактируется другим пользователем', 'lock': lock_info})
                ok_v, current_v = check_version(cur, order_id, expected_version)
                if not ok_v:
                    return json_resp(409, {'error': 'Версия устарела', 'version': current_v})
                cur.execute("DELETE FROM wholesale_order_items WHERE id = %s", (item_id,))
                total, ver = recalc_total(cur, order_id)
                conn.commit()
                return json_resp(200, {'ok': True, 'total_amount': total, 'version': ver})

            # Обновление шапки заявки (имя клиента, комментарий).
            if action == 'update_header':
                order_id = body.get('order_id')
                if not order_id:
                    return json_resp(400, {'error': 'Не указан order_id'})
                if is_recalc_locked(cur, order_id):
                    return json_resp(423, {'error': 'Идёт пересчёт цен, попробуйте позже'})
                ok_l, lock_info = check_lock_owner(cur, order_id, user_id, session_id)
                if not ok_l:
                    return json_resp(423, {'error': 'Заявка редактируется другим пользователем', 'lock': lock_info})
                ok_v, current_v = check_version(cur, order_id, expected_version)
                if current_v is None:
                    return json_resp(404, {'error': 'Заявка не найдена'})
                if not ok_v:
                    return json_resp(409, {'error': 'Версия устарела', 'version': current_v})
                fields = []
                vals = []
                if 'customer_name' in body:
                    cname = (body.get('customer_name') or '').strip()
                    fields.append("customer_name = %s")
                    vals.append(cname)
                    if cname:
                        cur.execute("INSERT INTO wholesalers (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", (cname,))
                        wid = cur.fetchone()[0]
                        fields.append("wholesaler_id = %s")
                        vals.append(wid)
                    else:
                        fields.append("wholesaler_id = %s")
                        vals.append(None)
                if 'comment' in body:
                    fields.append("comment = %s")
                    vals.append(body.get('comment'))
                if not fields:
                    return json_resp(400, {'error': 'Нет полей для обновления'})
                fields.append("updated_at = NOW()")
                vals.append(order_id)
                cur.execute(f"UPDATE wholesale_orders SET {', '.join(fields)} WHERE id = %s RETURNING updated_at", vals)
                ver = str(cur.fetchone()[0])
                conn.commit()
                return json_resp(200, {'ok': True, 'version': ver})

            # Старое поведение — создание сразу с позициями (оставлено для обратной совместимости).
            customer_name = body.get('customer_name', '').strip()
            comment = (body.get('comment') or '').strip() or None
            items = body.get('items', [])

            if not customer_name:
                return json_resp(400, {'error': 'Укажите имя оптовика'})
            if not items:
                return json_resp(400, {'error': 'Добавьте хотя бы одну позицию'})

            cur.execute("INSERT INTO wholesalers (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", (customer_name,))
            wid = cur.fetchone()[0]
            cur.execute(
                """INSERT INTO wholesale_orders
                   (customer_name, comment, total_amount, created_by, created_by_owner, wholesaler_id)
                   VALUES (%s, %s, 0, %s, %s, %s) RETURNING id""",
                (customer_name, comment, owner_manager_id, bool(is_owner), wid)
            )
            order_id = cur.fetchone()[0]
            for item in items:
                insert_item(cur, order_id, item, customer_name, actor)
            recalc_total(cur, order_id)
            touch_order(cur, order_id)
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