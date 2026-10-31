"""Ценовой стол: наборы товаров из заявок, разбор наименований с записью в карточку каталога,
ручная правка бренда и модели, курс набора."""
import re

from psycopg2.extras import RealDictCursor

from parser import CYR2LAT, find_brand, parse_name


# ---------- наборы ----------

def order_lines(cur, order_id):
    cur.execute(
        """SELECT oi.product_id, oi.temp_product_id, oi.quantity, oi.sort_order, oi.id,
                  CASE WHEN oi.temp_product_id IS NOT NULL THEN concat_ws(' ', tp.brand, tp.article)
                       ELSE COALESCE(p.name, oi.item_name) END AS name,
                  tp.brand AS tp_brand, tp.article AS tp_article
           FROM wholesale_order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
           LEFT JOIN temp_products tp ON tp.id = oi.temp_product_id
           WHERE oi.order_id = %s ORDER BY oi.sort_order NULLS LAST, oi.id""",
        (order_id,))
    return cur.fetchall()


def create_from_order(cur, uid, order_id):
    cur.execute("SELECT id, customer_name, created_at FROM wholesale_orders WHERE id = %s", (order_id,))
    o = cur.fetchone()
    if not o:
        return None, 'Заявка не найдена'
    lines = order_lines(cur, order_id)
    if not lines:
        return None, 'В заявке нет товаров'
    title = f"Заявка №{o['id']} · {o['customer_name'] or ''} · {o['created_at']:%d.%m.%Y}".strip()
    cur.execute("SELECT id FROM price_sets WHERE source_type = 'order' AND source_id = %s ORDER BY id DESC LIMIT 1",
                (order_id,))
    s = cur.fetchone()
    old_temp = {}
    if s:
        sid = s['id']
        cur.execute("SELECT temp_product_id, brand, model FROM price_set_items "
                    "WHERE set_id = %s AND temp_product_id IS NOT NULL", (sid,))
        old_temp = {r['temp_product_id']: r for r in cur.fetchall()}
        cur.execute("DELETE FROM price_set_items WHERE set_id = %s", (sid,))
        cur.execute("UPDATE price_sets SET title = %s, updated_at = NOW() WHERE id = %s", (title, sid))
    else:
        cur.execute("INSERT INTO price_sets (title, source_type, source_id, created_by) "
                    "VALUES (%s, 'order', %s, %s) RETURNING id", (title, order_id, uid))
        sid = cur.fetchone()['id']
    seen = set()
    for i, ln in enumerate(lines):
        pid = None if ln['temp_product_id'] else ln['product_id']
        key = ('t', ln['temp_product_id']) if ln['temp_product_id'] else ('p', pid)
        if key in seen or not (pid or ln['temp_product_id']):
            continue
        seen.add(key)
        brand = model = None
        if ln['temp_product_id']:
            prev = old_temp.get(ln['temp_product_id'])
            brand = prev['brand'] if prev else ln['tp_brand']
            model = prev['model'] if prev else ln['tp_article']
        cur.execute(
            "INSERT INTO price_set_items (set_id, product_id, temp_product_id, name, quantity, sort_order, brand, model) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (sid, pid, ln['temp_product_id'], ln['name'], ln['quantity'], i, brand, model))
    return {'id': sid}, None


def list_sets(cur):
    cur.execute(
        """SELECT s.id, s.title, s.source_type, s.source_id, s.updated_at,
                  (SELECT count(*) FROM price_set_items i WHERE i.set_id = s.id) AS items
           FROM price_sets s ORDER BY s.updated_at DESC LIMIT 50""")
    return {'sets': cur.fetchall()}


def get_set(cur, sid):
    cur.execute("SELECT * FROM price_sets WHERE id = %s", (sid,))
    s = cur.fetchone()
    if not s:
        return None, 'Набор не найден'
    cur.execute(
        """SELECT i.id, i.product_id, i.temp_product_id, i.quantity, i.sort_order,
                  COALESCE(p.name, i.name) AS name, p.article, p.product_group,
                  p.price_base, p.price_base_changed_at, p.parse_status, p.model AS p_model,
                  p.feature, b.name AS p_brand, g.name AS search_group, p.brand AS card_brand,
                  i.brand AS t_brand, i.model AS t_model, tp.article AS t_article
           FROM price_set_items i
           LEFT JOIN products p ON p.id = i.product_id AND i.temp_product_id IS NULL
           LEFT JOIN search_brands b ON b.id = p.search_brand_id
           LEFT JOIN search_groups g ON g.id = p.search_group_id
           LEFT JOIN temp_products tp ON tp.id = i.temp_product_id
           WHERE i.set_id = %s ORDER BY (i.temp_product_id IS NOT NULL), i.sort_order, i.id""", (sid,))
    items = []
    for r in cur.fetchall():
        is_new = r['temp_product_id'] is not None
        items.append({
            'id': r['id'], 'product_id': r['product_id'], 'temp_product_id': r['temp_product_id'],
            'is_new': is_new, 'name': r['name'], 'quantity': r['quantity'],
            'article': r['t_article'] if is_new else r['article'],
            'group': r['search_group'] or r['product_group'],
            'search_group': r['search_group'],
            'brand': r['t_brand'] if is_new else r['p_brand'],
            'model': r['t_model'] if is_new else r['p_model'],
            'feature': r['feature'],
            'parse_status': None if is_new else (r['parse_status'] or 'none'),
            'card_brand': r['card_brand'],
            'price_base': r['price_base'], 'price_base_changed_at': r['price_base_changed_at'],
        })
    return {'set': s, 'items': items}, None


# ---------- разбор ----------

def load_brands(cur):
    cur.execute("SELECT id, name, aliases FROM search_brands")
    return [{'id': r['id'], 'name': r['name'], 'aliases': list({r['name'], *(r['aliases'] or [])})}
            for r in cur.fetchall()]


def brand_by_name(cur, brands, name):
    """Бренд справочника по названию или синониму; если нет — заводим новый."""
    n = re.sub(r'\s+', ' ', (name or '').strip())
    if not n:
        return None
    for b in brands:
        if n.lower() in (a.lower() for a in b['aliases']):
            return b
    cur.execute("INSERT INTO search_brands (name, aliases) VALUES (%s, %s) RETURNING id", (n, [n]))
    b = {'id': cur.fetchone()['id'], 'name': n, 'aliases': [n]}
    brands.append(b)
    return b


def group_id(cur, name):
    if not name:
        return None
    cur.execute("SELECT id FROM search_groups WHERE lower(name) = lower(%s) LIMIT 1", (name,))
    g = cur.fetchone()
    if g:
        return g['id']
    cur.execute("INSERT INTO search_groups (name) VALUES (%s) RETURNING id", (name,))
    return cur.fetchone()['id']


def parse_one(cur, brands, name, card_brand, group, article):
    """Бренд ищем в наименовании по справочнику; не нашли — бренд карточки или папка каталога,
    если она встречается в наименовании. Модели нет — берём артикул, если он есть в наименовании."""
    best, best_pos = None, None
    for b in brands:
        m = find_brand(name or '', b['aliases'])
        if m and (best_pos is None or m.start() < best_pos):
            best, best_pos = b, m.start()
    res = None
    if best:
        res = parse_name(name, best['aliases'])
    else:
        for cand in (card_brand, group):
            if cand and (cand == card_brand or find_brand(name or '', [cand])):
                best = brand_by_name(cur, brands, cand)
                if best:
                    res = parse_name(name, best['aliases'], assume_brand=cand != group)
                    break
    if not best or not res:
        return None, None
    art = (article or '').strip()
    if not res['model'] and art and art.lower() in (name or '').lower():
        res['model'] = art.translate(CYR2LAT) if not re.search(r'[^АВЕКМНОРСТХаеорсху\W\d]', art) else art
        feat = re.sub(re.escape(art), '', res['feature'] or '', flags=re.IGNORECASE)
        res['feature'] = re.sub(r'\s+', ' ', feat).strip(' ,;') or None
        res['status'] = 'parsed' if res['group'] else 'doubtful'
    return best, res


def parse_items(cur, sid, item_ids, only_new):
    cur.execute(
        """SELECT p.id, p.name, p.brand, p.parse_status, p.product_group, p.article FROM price_set_items i
           JOIN products p ON p.id = i.product_id WHERE i.set_id = %s""", (sid,))
    rows = cur.fetchall()
    if item_ids:
        cur.execute("SELECT product_id FROM price_set_items WHERE set_id = %s AND id = ANY(%s)", (sid, item_ids))
        want = {r['product_id'] for r in cur.fetchall()}
        rows = [r for r in rows if r['id'] in want]
    brands = load_brands(cur)
    counts = {'parsed': 0, 'doubtful': 0, 'no_brand': 0, 'skipped': 0}
    for r in rows:
        st = r['parse_status'] or 'none'
        if st == 'manual' or (only_new and st != 'none'):
            counts['skipped'] += 1
            continue
        b, res = parse_one(cur, brands, r['name'], r['brand'], r['product_group'], r['article'])
        if not b or not res:
            counts['no_brand'] += 1
            continue
        cur.execute(
            "UPDATE products SET search_group_id = %s, search_brand_id = %s, model = %s, feature = %s, "
            "parse_status = %s WHERE id = %s AND COALESCE(parse_status, 'none') <> 'manual'",
            (group_id(cur, res['group']), b['id'], res['model'], res['feature'], res['status'], r['id']))
        counts[res['status']] += 1
    return counts


def save_item(cur, sid, body):
    cur.execute("SELECT id, product_id, temp_product_id FROM price_set_items WHERE id = %s AND set_id = %s",
                (body.get('item_id'), sid))
    it = cur.fetchone()
    if not it:
        return None, 'Строка не найдена'
    brand = re.sub(r'\s+', ' ', (body.get('brand') or '').strip()) or None
    model = re.sub(r'\s+', ' ', (body.get('model') or '').strip()) or None
    if it['temp_product_id']:
        cur.execute("UPDATE price_set_items SET brand = %s, model = %s WHERE id = %s", (brand, model, it['id']))
        return {'ok': True}, None
    b = brand_by_name(cur, load_brands(cur), brand) if brand else None
    cur.execute("UPDATE products SET search_brand_id = %s, model = %s, parse_status = 'manual' WHERE id = %s",
                (b['id'] if b else None, model, it['product_id']))
    return {'ok': True}, None


def save_rate(cur, sid, body):
    raw = str(body.get('rate') or '').replace(' ', '').replace(',', '.')
    rate = None
    if raw:
        try:
            rate = round(float(raw), 4)
        except ValueError:
            return None, 'Курс — это число'
        if rate <= 0:
            return None, 'Курс должен быть больше нуля'
    cur.execute("UPDATE price_sets SET rate_by_per_100_rub = %s, updated_at = NOW() WHERE id = %s", (rate, sid))
    return {'rate': rate}, None


def run(conn, uid, params, body):
    """Возвращает (status, data)."""
    action = body.get('action') or params.get('action') or ''
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if action == 'list':
            return 200, list_sets(cur)
        sid = int(body.get('set_id') or params.get('id') or 0)
        if action == 'from_order':
            data, err = create_from_order(cur, uid, int(body.get('order_id') or 0))
        elif action == 'get':
            data, err = get_set(cur, sid)
        elif action == 'parse':
            ids = [int(x) for x in (body.get('item_ids') or [])]
            counts = parse_items(cur, sid, ids, only_new=not ids)
            data, err = get_set(cur, sid)
            if data:
                data['counts'] = counts
        elif action == 'save_item':
            data, err = save_item(cur, sid, body)
        elif action == 'rate':
            data, err = save_rate(cur, sid, body)
        else:
            return 400, {'error': 'Неизвестное действие'}
    if err:
        return 400, {'error': err}
    return 200, data
