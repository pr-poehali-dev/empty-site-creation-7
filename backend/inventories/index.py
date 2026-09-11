"""Инвентаризации оптовиков: список, позиции, поиск товаров с ценой своей фирмы.

Ключевое правило: оптовик видит ТОЛЬКО цену своей фирмы из «Определения цен»
(или оптовую из карточки, если правила нет). Никакие другие цены —
базовая, розничная, закупочная — в ответ не попадают вовсе.
"""
import json
import os
import re
from datetime import datetime
import psycopg2

WHOLESALER_ROLE = 'Оптовик'
# Роли, которым инвентаризации доступны наравне с владельцем.
STAFF_ROLES = ['Управляющий', 'Менеджер опта']


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def json_resp(status, payload):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'isBase64Encoded': False,
        'body': json.dumps(payload, default=str),
    }


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
        """SELECT m.id, m.role_id, r.name FROM managers m
           LEFT JOIN roles r ON r.id = m.role_id
           WHERE m.phone = %s AND m.status = 'authorized'""",
        (phone,)
    )
    return cur.fetchone()


def get_own_wholesaler_ids(cur, manager_id):
    """Фирмы, к которым привязан оптовик."""
    cur.execute(
        "SELECT wholesaler_id FROM manager_wholesalers WHERE manager_id = %s",
        (manager_id,)
    )
    return [r[0] for r in cur.fetchall()]


# ---------------------------------------------------------------- цены

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


def load_rules(cur, wholesaler_id):
    """Правила ценообразования фирмы. Ищем строго по id, не по названию."""
    cur.execute(
        """SELECT filter_type, filter_value, price_field, formula,
                  condition_price_field, condition_operator, condition_value
           FROM pricing_rules WHERE wholesaler_id = %s ORDER BY priority""",
        (wholesaler_id,)
    )
    return cur.fetchall()


def price_for_product(prod_prices, prod_dates, product_group, rules):
    """Цена фирмы: сработало правило — по нему, иначе оптовая из карточки.

    Возвращает (цена, источник, дата основы).
    """
    def from_card():
        return (float(prod_prices.get('price_wholesale') or 0), 'card',
                prod_dates.get('price_wholesale'))

    if not rules:
        return from_card()
    for r in rules:
        if r[0] == 'product_group' and product_group == r[1]:
            if check_condition(prod_prices, r[4], r[5], r[6]):
                field = r[2]
                base = float(prod_prices.get(field) or 0)
                return apply_formula(base, r[3]), 'rule', prod_dates.get(field)
    return from_card()


def calc_price_detailed(cur, wholesaler_id, product_id):
    cur.execute(
        """SELECT price_base, price_retail, price_wholesale, price_purchase, product_group,
                  price_base_changed_at, price_retail_changed_at,
                  price_wholesale_changed_at, price_purchase_changed_at
           FROM products WHERE id = %s""",
        (product_id,)
    )
    p = cur.fetchone()
    if not p:
        return 0, None, None
    prices = {'price_base': p[0], 'price_retail': p[1],
              'price_wholesale': p[2], 'price_purchase': p[3]}
    dates = {'price_base': p[5], 'price_retail': p[6],
             'price_wholesale': p[7], 'price_purchase': p[8]}
    return price_for_product(prices, dates, p[4], load_rules(cur, wholesaler_id))


# ---------------------------------------------------------------- доступ

def resolve_actor(cur, token):
    """Кто пришёл: владелец, управленец или оптовик.

    Возвращает словарь или None, если токен недействителен.
    """
    user = get_user_by_token(cur, token)
    if not user:
        return None
    if user[2] == 'owner':
        return {'is_owner': True, 'manager_id': None, 'role': None, 'actor': 'owner'}
    mgr = get_manager_info(cur, user[1])
    if not mgr:
        return None
    return {
        'is_owner': False,
        'manager_id': mgr[0],
        'role': mgr[2],
        'actor': str(mgr[0]),
    }


def can_see_inventory(cur, inv_row, who):
    """inv_row: (id, wholesaler_id, created_by, created_by_owner, is_archived)"""
    if who['is_owner']:
        return True
    # Для всех, кроме владельца, архивная инвентаризация не существует.
    if len(inv_row) > 4 and inv_row[4]:
        return False
    inv_id, wid, created_by, by_owner = inv_row[0], inv_row[1], inv_row[2], inv_row[3]
    if who['role'] == WHOLESALER_ROLE:
        # Оптовик видит только свои инвентаризации по своим фирмам.
        if by_owner or created_by != who['manager_id']:
            return False
        return wid in get_own_wholesaler_ids(cur, who['manager_id'])
    if who['role'] in STAFF_ROLES:
        cur.execute(
            "SELECT 1 FROM inventory_shares WHERE inventory_id = %s AND manager_id = %s",
            (inv_id, who['manager_id'])
        )
        return cur.fetchone() is not None
    return False


def can_edit_prices(who):
    """Цены правит только владелец. Оптовик — никогда, даже нулевую."""
    return who['is_owner']


# ---------------------------------------------------------------- позиции

def fetch_item_view(cur, item_id, is_owner):
    cur.execute(
        """SELECT ii.id, ii.product_id, p.name, p.article, ii.quantity, ii.price, ii.amount,
                  ii.created_by, ii.qty_changed_by, ii.price_changed_by,
                  ii.price_is_manual, ii.price_source, ii.price_base_date, ii.price_set_at,
                  ii.sort_order, ii.temp_product_id, tp.brand, tp.article
           FROM inventory_items ii
           JOIN products p ON p.id = ii.product_id
           LEFT JOIN temp_products tp ON tp.id = ii.temp_product_id
           WHERE ii.id = %s""",
        (item_id,)
    )
    r = cur.fetchone()
    if not r:
        return None
    is_temp = r[15] is not None
    view = {
        'id': r[0],
        'product_id': r[1],
        'name': (' '.join([p for p in [r[16], r[17]] if p]) or 'Без названия') if is_temp else r[2],
        'article': r[17] if is_temp else r[3],
        'is_temp': is_temp,
        'temp_product_id': r[15],
        'quantity': r[4],
        'price': float(r[5]),
        'amount': float(r[6]),
        'price_is_manual': bool(r[10]),
        'price_source': r[11],
        'price_date': (r[12] or r[13]).strftime('%d.%m.%y') if (r[12] or r[13]) else None,
        'sort_order': r[14],
    }
    # Номера сотрудников в подписях показываем только владельцу.
    if is_owner:
        view['created_by'] = r[7]
        view['qty_changed_by'] = r[8]
        view['price_changed_by'] = r[9]
    return view


def recalc_total(cur, inventory_id):
    cur.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM inventory_items WHERE inventory_id = %s",
        (inventory_id,)
    )
    total = float(cur.fetchone()[0])
    cur.execute(
        "UPDATE inventories SET total_amount = %s, updated_at = NOW() WHERE id = %s",
        (total, inventory_id)
    )
    return total


def load_inventory(cur, inventory_id):
    cur.execute(
        """SELECT id, wholesaler_id, created_by, created_by_owner, is_archived
           FROM inventories WHERE id = %s""",
        (inventory_id,)
    )
    return cur.fetchone()


def export_xlsx(cur, inventory_id):
    """Выгрузка в Excel. Цены берём из строк инвентаризации — те самые,
    что посчитаны по фирме этой инвентаризации, никакие другие."""
    import base64
    import io
    from openpyxl import Workbook

    cur.execute(
        """SELECT i.id, w.name, i.comment, i.created_at
           FROM inventories i JOIN wholesalers w ON w.id = i.wholesaler_id
           WHERE i.id = %s""",
        (inventory_id,)
    )
    head = cur.fetchone()
    cur.execute(
        """SELECT CASE WHEN ii.temp_product_id IS NOT NULL
                       THEN COALESCE(NULLIF(TRIM(CONCAT_WS(' ', tp.brand, tp.article)), ''), 'Без названия')
                       ELSE p.name END,
                  CASE WHEN ii.temp_product_id IS NOT NULL THEN tp.article ELSE p.article END,
                  ii.quantity, ii.price, ii.amount
           FROM inventory_items ii
           JOIN products p ON p.id = ii.product_id
           LEFT JOIN temp_products tp ON tp.id = ii.temp_product_id
           WHERE ii.inventory_id = %s
           ORDER BY ii.sort_order""",
        (inventory_id,)
    )
    rows = cur.fetchall()

    wb = Workbook()
    ws = wb.active
    ws.title = 'Инвентаризация'
    ws.append([f'Инвентаризация №{head[0]}'])
    ws.append(['Фирма', head[1]])
    if head[2]:
        ws.append(['Комментарий', head[2]])
    ws.append(['Дата', head[3].strftime('%d.%m.%Y') if head[3] else ''])
    ws.append([])
    ws.append(['№', 'Наименование', 'Артикул', 'Кол-во', 'Цена', 'Сумма'])

    total = 0
    for idx, r in enumerate(rows, 1):
        amount = float(r[4] or 0)
        total += amount
        ws.append([idx, r[0], r[1] or '', int(r[2]), float(r[3] or 0), amount])
    ws.append([])
    ws.append(['', '', '', '', 'Итого', round(total, 2)])

    for col, width in zip('ABCDEF', [6, 55, 20, 10, 14, 14]):
        ws.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    return json_resp(200, {
        'file': base64.b64encode(buf.getvalue()).decode(),
        'filename': f'Инвентаризация-{head[0]}.xlsx',
    })


def handler(event: dict, context) -> dict:
    """Инвентаризации оптовиков: список, позиции, поиск товаров со своей ценой."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, Authorization, X-Authorization',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    headers = event.get('headers') or {}
    auth = headers.get('X-Authorization') or headers.get('x-authorization') or \
           headers.get('Authorization') or headers.get('authorization') or ''
    token = auth.replace('Bearer ', '').strip()
    if not token:
        return json_resp(401, {'error': 'Не авторизован'})

    conn = get_db()
    try:
        cur = conn.cursor()
        who = resolve_actor(cur, token)
        if not who:
            return json_resp(401, {'error': 'Сессия истекла'})

        # Доступ к разделу: владелец, оптовик и управленцы из списка.
        if not who['is_owner'] and who['role'] != WHOLESALER_ROLE and who['role'] not in STAFF_ROLES:
            return json_resp(403, {'error': 'Нет доступа к инвентаризациям'})

        qs = event.get('queryStringParameters') or {}

        # ---------------------------------------------------------- GET
        if method == 'GET':
            inv_id = qs.get('id')

            if inv_id:
                inv = load_inventory(cur, int(inv_id))
                if not inv:
                    return json_resp(404, {'error': 'Инвентаризация не найдена'})
                if not can_see_inventory(cur, inv, who):
                    return json_resp(403, {'error': 'Нет доступа'})

                if qs.get('export'):
                    return export_xlsx(cur, int(inv_id))

                cur.execute(
                    """SELECT i.id, i.wholesaler_id, w.name, i.comment, i.total_amount,
                              i.created_at, i.updated_at, i.created_by, i.created_by_owner
                       FROM inventories i
                       JOIN wholesalers w ON w.id = i.wholesaler_id
                       WHERE i.id = %s""",
                    (int(inv_id),)
                )
                r = cur.fetchone()
                cur.execute(
                    "SELECT id FROM inventory_items WHERE inventory_id = %s ORDER BY sort_order",
                    (int(inv_id),)
                )
                item_ids = [x[0] for x in cur.fetchall()]
                items = [fetch_item_view(cur, i, who['is_owner']) for i in item_ids]
                return json_resp(200, {
                    'id': r[0],
                    'wholesaler_id': r[1],
                    'wholesaler_name': r[2],
                    'comment': r[3],
                    'total_amount': float(r[4]),
                    'created_at': r[5].isoformat() if r[5] else None,
                    'updated_at': r[6].isoformat() if r[6] else None,
                    'items': items,
                    'can_edit_prices': can_edit_prices(who),
                    'can_delete': True,
                    'is_archived': bool(inv[4]),
                    'is_owner': who['is_owner'],
                })

            # Список. Последняя сверху — как в заявках.
            # Архив видит только владелец: для остальных архивная не существует.
            show_archived = qs.get('archived') == '1' and who['is_owner']
            conditions, values = [], []
            conditions.append("i.is_archived = %s")
            values.append(bool(show_archived))
            if not who['is_owner']:
                if who['role'] == WHOLESALER_ROLE:
                    own = get_own_wholesaler_ids(cur, who['manager_id'])
                    if not own:
                        return json_resp(200, {
                            'inventories': [], 'wholesalers': [],
                            'is_owner': False, 'can_delete': False,
                        })
                    conditions.append(
                        "i.created_by = %s AND i.created_by_owner = false AND i.wholesaler_id = ANY(%s)"
                    )
                    values.extend([who['manager_id'], own])
                else:
                    conditions.append(
                        "EXISTS(SELECT 1 FROM inventory_shares s "
                        "WHERE s.inventory_id = i.id AND s.manager_id = %s)"
                    )
                    values.append(who['manager_id'])
            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            cur.execute(
                f"""SELECT i.id, i.wholesaler_id, w.name, i.comment, i.total_amount,
                           i.created_at, i.updated_at,
                           (SELECT COUNT(*) FROM inventory_items ii WHERE ii.inventory_id = i.id)
                    FROM inventories i
                    JOIN wholesalers w ON w.id = i.wholesaler_id
                    {where}
                    ORDER BY i.id DESC""",
                values
            )
            inventories = [
                {
                    'id': r[0],
                    'wholesaler_id': r[1],
                    'wholesaler_name': r[2],
                    'comment': r[3],
                    'total_amount': float(r[4]),
                    'created_at': r[5].isoformat() if r[5] else None,
                    'updated_at': r[6].isoformat() if r[6] else None,
                    'items_count': r[7],
                }
                for r in cur.fetchall()
            ]

            # Фирмы для выбора: оптовику — только его, остальным — все.
            if who['is_owner'] or who['role'] in STAFF_ROLES:
                cur.execute("SELECT id, name FROM wholesalers ORDER BY name")
            else:
                cur.execute(
                    """SELECT w.id, w.name FROM wholesalers w
                       JOIN manager_wholesalers mw ON mw.wholesaler_id = w.id
                       WHERE mw.manager_id = %s ORDER BY w.name""",
                    (who['manager_id'],)
                )
            firms = [{'id': r[0], 'name': r[1]} for r in cur.fetchall()]

            return json_resp(200, {
                'inventories': inventories,
                'wholesalers': firms,
                'is_owner': who['is_owner'],
                'can_delete': True,
                'archived': bool(show_archived),
            })

        # ---------------------------------------------------------- POST
        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            action = body.get('action')

            # Создание инвентаризации.
            if action == 'create':
                wid = body.get('wholesaler_id')
                if not wid:
                    return json_resp(400, {'error': 'Выберите фирму'})
                try:
                    wid = int(wid)
                except (TypeError, ValueError):
                    return json_resp(400, {'error': 'Некорректная фирма'})
                # Оптовик заводит инвентаризацию только по своей фирме.
                if not who['is_owner'] and who['role'] == WHOLESALER_ROLE:
                    if wid not in get_own_wholesaler_ids(cur, who['manager_id']):
                        return json_resp(403, {'error': 'Фирма вам не принадлежит'})
                cur.execute("SELECT id FROM wholesalers WHERE id = %s", (wid,))
                if not cur.fetchone():
                    return json_resp(400, {'error': 'Фирма не найдена'})
                cur.execute(
                    """INSERT INTO inventories (wholesaler_id, created_by, created_by_owner)
                       VALUES (%s, %s, %s) RETURNING id""",
                    (wid, who['manager_id'], who['is_owner'])
                )
                new_id = cur.fetchone()[0]
                conn.commit()
                return json_resp(200, {'id': new_id})

            inventory_id = body.get('inventory_id')
            if not inventory_id:
                return json_resp(400, {'error': 'Не указана инвентаризация'})
            inv = load_inventory(cur, int(inventory_id))
            if not inv:
                return json_resp(404, {'error': 'Инвентаризация не найдена'})
            if not can_see_inventory(cur, inv, who):
                return json_resp(403, {'error': 'Нет доступа'})
            inv_wid = inv[1]

            # Поиск товаров: в выдаче только цена фирмы этой инвентаризации.
            if action == 'search_products':
                q = (body.get('query') or '').strip()
                group = body.get('product_group')
                mode = body.get('mode') or 'all'
                if not q and not group:
                    return json_resp(200, {'products': []})
                rules = load_rules(cur, inv_wid)
                conds = ["p.article <> '__TEMP__'", "COALESCE(p.is_archived, false) = false"]
                vals = []
                if group:
                    conds.append("p.product_group = %s")
                    vals.append(group)
                if q:
                    like = f"%{q}%"
                    if mode == 'article':
                        conds.append("p.article ILIKE %s")
                        vals.append(like)
                    elif mode == 'supplier_code':
                        conds.append("p.supplier_code ILIKE %s")
                        vals.append(like)
                    else:
                        # Название, артикул, бренд, код поставщика и штрихкод:
                        # цифры ищутся как часть штрихкода.
                        conds.append(
                            "(p.name ILIKE %s OR p.article ILIKE %s OR p.brand ILIKE %s "
                            "OR p.supplier_code ILIKE %s "
                            "OR EXISTS(SELECT 1 FROM product_barcodes b "
                            "WHERE b.product_id = p.id AND b.barcode LIKE %s))"
                        )
                        vals.extend([like, like, like, like, like])
                cur.execute(
                    f"""SELECT p.id, p.name, p.article, p.product_group, p.brand,
                               p.price_base, p.price_retail, p.price_wholesale, p.price_purchase,
                               p.price_base_changed_at, p.price_retail_changed_at,
                               p.price_wholesale_changed_at, p.price_purchase_changed_at
                        FROM products p
                        WHERE {' AND '.join(conds)}
                        ORDER BY p.name LIMIT 50""",
                    vals
                )
                products = []
                for r in cur.fetchall():
                    prices = {'price_base': r[5], 'price_retail': r[6],
                              'price_wholesale': r[7], 'price_purchase': r[8]}
                    dates = {'price_base': r[9], 'price_retail': r[10],
                             'price_wholesale': r[11], 'price_purchase': r[12]}
                    price, src, base_date = price_for_product(prices, dates, r[3], rules)
                    # В ответ уходит ТОЛЬКО цена фирмы — остальных цен здесь нет.
                    products.append({
                        'id': r[0],
                        'name': r[1],
                        'article': r[2],
                        'brand': r[4],
                        'product_group': r[3],
                        'price': price,
                        'price_source': src,
                        'price_date': base_date.strftime('%d.%m.%y') if base_date else None,
                    })
                return json_resp(200, {'products': products})

            # Список групп товаров для фильтра.
            if action == 'product_groups':
                cur.execute(
                    """SELECT DISTINCT product_group FROM products
                       WHERE product_group IS NOT NULL AND product_group <> ''
                       ORDER BY product_group"""
                )
                return json_resp(200, {'groups': [r[0] for r in cur.fetchall()]})

            # Поиск товара по штрихкоду целиком — для ручного сканера.
            if action == 'scan_barcode':
                code = (body.get('barcode') or '').strip()
                if not code:
                    return json_resp(400, {'error': 'Пустой штрихкод'})
                # exact=false — подсказки по части кода, true — точное совпадение.
                exact = bool(body.get('exact'))
                if exact:
                    where, arg, limit = "b.barcode = %s", code, 1
                else:
                    where, arg, limit = "b.barcode LIKE %s", f"%{code}%", 20
                cur.execute(
                    f"""SELECT DISTINCT ON (p.id)
                               p.id, p.name, p.article, p.product_group, p.brand,
                               p.price_base, p.price_retail, p.price_wholesale, p.price_purchase,
                               p.price_base_changed_at, p.price_retail_changed_at,
                               p.price_wholesale_changed_at, p.price_purchase_changed_at
                       FROM products p
                       JOIN product_barcodes b ON b.product_id = p.id
                       WHERE {where} AND COALESCE(p.is_archived, false) = false
                       LIMIT {limit}""",
                    (arg,)
                )
                rows = cur.fetchall()
                rules = load_rules(cur, inv_wid)
                found = []
                for r in rows:
                    prices = {'price_base': r[5], 'price_retail': r[6],
                              'price_wholesale': r[7], 'price_purchase': r[8]}
                    dates = {'price_base': r[9], 'price_retail': r[10],
                             'price_wholesale': r[11], 'price_purchase': r[12]}
                    price, src, base_date = price_for_product(prices, dates, r[3], rules)
                    found.append({
                        'id': r[0], 'name': r[1], 'article': r[2], 'brand': r[4],
                        'price': price, 'price_source': src,
                        'price_date': base_date.strftime('%d.%m.%y') if base_date else None,
                    })
                return json_resp(200, {
                    'found': len(found) > 0,
                    'products': found,
                    'product': found[0] if found else None,
                })

            # Добавить позицию. Цена считается на сервере и застывает в строке.
            if action == 'add_item':
                pid = body.get('product_id')
                temp_pid = body.get('temp_product_id')
                qty = int(body.get('quantity') or 1)

                if temp_pid:
                    # Временный товар: цена своя, правила фирмы к нему неприменимы.
                    cur.execute(
                        "SELECT price FROM temp_products WHERE id = %s", (int(temp_pid),)
                    )
                    trow = cur.fetchone()
                    if not trow:
                        return json_resp(400, {'error': 'Временный товар не найден'})
                    cur.execute("SELECT id FROM products WHERE article = '__TEMP__' LIMIT 1")
                    prow = cur.fetchone()
                    if not prow:
                        return json_resp(400, {'error': 'Нет заглушки временных товаров'})
                    pid = prow[0]
                    price = float(trow[0] or 0)
                    src, base_date = 'temp', None
                else:
                    if not pid:
                        return json_resp(400, {'error': 'Не указан товар'})
                    cur.execute("SELECT id FROM products WHERE id = %s", (int(pid),))
                    if not cur.fetchone():
                        return json_resp(400, {'error': 'Товар не найден'})
                    price, src, base_date = calc_price_detailed(cur, inv_wid, int(pid))
                amount = round(price * qty, 2)
                cur.execute(
                    "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM inventory_items WHERE inventory_id = %s",
                    (int(inventory_id),)
                )
                sort_order = cur.fetchone()[0]
                cur.execute(
                    """INSERT INTO inventory_items
                       (inventory_id, product_id, temp_product_id, quantity, price, amount, sort_order,
                        created_by, qty_changed_by, price_changed_by,
                        price_source, price_base_date)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (int(inventory_id), int(pid), int(temp_pid) if temp_pid else None,
                     qty, price, amount, sort_order,
                     who['actor'], who['actor'], who['actor'], src, base_date)
                )
                item_id = cur.fetchone()[0]
                total = recalc_total(cur, int(inventory_id))
                conn.commit()
                return json_resp(200, {
                    'item': fetch_item_view(cur, item_id, who['is_owner']),
                    'total_amount': total,
                })

            # Изменить количество или цену.
            if action == 'update_item':
                item_id = body.get('item_id')
                if not item_id:
                    return json_resp(400, {'error': 'Не указана позиция'})
                cur.execute(
                    "SELECT quantity, price FROM inventory_items WHERE id = %s AND inventory_id = %s",
                    (int(item_id), int(inventory_id))
                )
                cur_item = cur.fetchone()
                if not cur_item:
                    return json_resp(404, {'error': 'Позиция не найдена'})
                qty = cur_item[0]
                price = float(cur_item[1])
                fields, vals = [], []

                if 'quantity' in body:
                    qty = int(body.get('quantity') or 0)
                    if qty < 0:
                        return json_resp(400, {'error': 'Количество не может быть отрицательным'})
                    fields.append("quantity = %s")
                    vals.append(qty)
                    fields.append("qty_changed_by = %s")
                    vals.append(who['actor'])

                if 'price' in body:
                    # Цену меняет только владелец — оптовику отказ даже при нуле.
                    if not can_edit_prices(who):
                        return json_resp(403, {'error': 'Изменение цены недоступно'})
                    price = float(body.get('price') or 0)
                    fields.append("price = %s")
                    vals.append(price)
                    fields.append("price_is_manual = true")
                    fields.append("price_source = 'manual'")
                    fields.append("price_set_at = NOW()")
                    fields.append("price_changed_by = %s")
                    vals.append(who['actor'])

                if not fields:
                    return json_resp(400, {'error': 'Нет полей для обновления'})

                fields.append("amount = %s")
                vals.append(round(price * qty, 2))
                vals.append(int(item_id))
                cur.execute(
                    f"UPDATE inventory_items SET {', '.join(fields)} WHERE id = %s",
                    vals
                )
                total = recalc_total(cur, int(inventory_id))
                conn.commit()
                return json_resp(200, {
                    'item': fetch_item_view(cur, int(item_id), who['is_owner']),
                    'total_amount': total,
                })

            if action == 'delete_item':
                item_id = body.get('item_id')
                if not item_id:
                    return json_resp(400, {'error': 'Не указана позиция'})
                cur.execute(
                    "DELETE FROM inventory_items WHERE id = %s AND inventory_id = %s",
                    (int(item_id), int(inventory_id))
                )
                total = recalc_total(cur, int(inventory_id))
                conn.commit()
                return json_resp(200, {'ok': True, 'total_amount': total})

            if action == 'update_header':
                if 'comment' in body:
                    cur.execute(
                        "UPDATE inventories SET comment = %s, updated_at = NOW() WHERE id = %s",
                        (body.get('comment'), int(inventory_id))
                    )
                    conn.commit()
                return json_resp(200, {'ok': True})

            # Подставить цену там, где ноль.
            if action == 'recalc_zero_prices':
                cur.execute(
                    """SELECT id, product_id, quantity FROM inventory_items
                       WHERE inventory_id = %s AND price = 0
                         AND temp_product_id IS NULL""",
                    (int(inventory_id),)
                )
                zeros = cur.fetchall()
                updated = 0
                for item_id, pid, qty in zeros:
                    price, src, base_date = calc_price_detailed(cur, inv_wid, pid)
                    if price <= 0:
                        continue
                    cur.execute(
                        """UPDATE inventory_items
                           SET price = %s, amount = %s, price_source = %s,
                               price_base_date = %s, price_changed_by = %s
                           WHERE id = %s""",
                        (price, round(price * qty, 2), src, base_date, who['actor'], item_id)
                    )
                    updated += 1
                total = recalc_total(cur, int(inventory_id))
                conn.commit()
                return json_resp(200, {
                    'updated': updated,
                    'total_zero': len(zeros),
                    'total_amount': total,
                })

            # Настройки видимости — только владелец.
            if action == 'get_visibility':
                if not who['is_owner']:
                    return json_resp(403, {'error': 'Нет прав на настройку видимости'})
                cur.execute(
                    "SELECT manager_id FROM inventory_shares WHERE inventory_id = %s",
                    (int(inventory_id),)
                )
                shared = [r[0] for r in cur.fetchall()]
                cur.execute(
                    """SELECT m.id, m.first_name, m.last_name
                       FROM managers m
                       LEFT JOIN roles r ON r.id = m.role_id
                       WHERE m.status = 'authorized' AND COALESCE(r.name, '') <> %s
                       ORDER BY m.first_name, m.last_name""",
                    (WHOLESALER_ROLE,)
                )
                managers = [
                    {'id': r[0], 'name': f"{r[1] or ''} {r[2] or ''}".strip() or f"#{r[0]}"}
                    for r in cur.fetchall()
                ]
                return json_resp(200, {'shared_manager_ids': shared, 'managers': managers})

            if action == 'set_visibility':
                if not who['is_owner']:
                    return json_resp(403, {'error': 'Нет прав на настройку видимости'})
                ids = body.get('shared_manager_ids') or []
                clean = []
                for x in ids:
                    try:
                        clean.append(int(x))
                    except (TypeError, ValueError):
                        pass
                if clean:
                    # Оптовику доступ через эти настройки не выдаём.
                    cur.execute(
                        """SELECT count(*) FROM managers m
                           JOIN roles r ON r.id = m.role_id
                           WHERE r.name = %s AND m.id = ANY(%s)""",
                        (WHOLESALER_ROLE, clean)
                    )
                    if cur.fetchone()[0] > 0:
                        return json_resp(400, {'error': 'Оптовика нельзя добавить через настройки видимости'})
                cur.execute(
                    "DELETE FROM inventory_shares WHERE inventory_id = %s",
                    (int(inventory_id),)
                )
                for mid in set(clean):
                    cur.execute(
                        """INSERT INTO inventory_shares (inventory_id, manager_id)
                           VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                        (int(inventory_id), mid)
                    )
                conn.commit()
                return json_resp(200, {'ok': True, 'shared_manager_ids': list(set(clean))})

            # Вернуть из архива — только владелец.
            if action == 'restore':
                if not who['is_owner']:
                    return json_resp(403, {'error': 'Восстановление недоступно'})
                cur.execute(
                    """UPDATE inventories
                       SET is_archived = false, archived_at = NULL, archived_by = NULL
                       WHERE id = %s""",
                    (int(inventory_id),)
                )
                conn.commit()
                return json_resp(200, {'ok': True})

            return json_resp(400, {'error': 'Неизвестное действие'})

        # ---------------------------------------------------------- DELETE
        if method == 'DELETE':
            inv_id = qs.get('id')
            if not inv_id:
                return json_resp(400, {'error': 'Не указана инвентаризация'})
            inv = load_inventory(cur, int(inv_id))
            if not inv:
                return json_resp(404, {'error': 'Инвентаризация не найдена'})
            if not can_see_inventory(cur, inv, who):
                return json_resp(403, {'error': 'Нет доступа'})

            # purge — стереть насовсем. Только владелец и только из архива.
            if qs.get('purge') == '1':
                if not who['is_owner']:
                    return json_resp(403, {'error': 'Удаление недоступно'})
                cur.execute("SELECT is_archived FROM inventories WHERE id = %s", (int(inv_id),))
                arch = cur.fetchone()
                if not arch or not arch[0]:
                    return json_resp(400, {'error': 'Сначала переместите в архив'})
                cur.execute("DELETE FROM inventory_shares WHERE inventory_id = %s", (int(inv_id),))
                cur.execute("DELETE FROM inventory_items WHERE inventory_id = %s", (int(inv_id),))
                cur.execute("DELETE FROM inventories WHERE id = %s", (int(inv_id),))
                conn.commit()
                return json_resp(200, {'ok': True, 'purged': True})

            # Обычное удаление — уход в архив.
            cur.execute(
                """UPDATE inventories
                   SET is_archived = true, archived_at = NOW(), archived_by = %s
                   WHERE id = %s""",
                (who['actor'], int(inv_id))
            )
            conn.commit()
            return json_resp(200, {'ok': True, 'archived': True})

        return json_resp(405, {'error': 'Метод не поддерживается'})
    finally:
        conn.close()