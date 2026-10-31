"""Ценовой стол: наборы товаров из заявок, разбор наименований с записью в карточку каталога,
ручная правка бренда и модели, курс набора."""
import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from psycopg2.extras import RealDictCursor, execute_values

from parser import WORD, clean, cut_quoted, find_brand, model_status, parse_name, split_group


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
    seen, rows = set(), []
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
        rows.append((sid, pid, ln['temp_product_id'], ln['name'], ln['quantity'], i, brand, model))
    if rows:
        execute_values(
            cur,
            "INSERT INTO price_set_items (set_id, product_id, temp_product_id, name, quantity, sort_order, brand, model) "
            "VALUES %s", rows, page_size=2000)
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
                  i.brand AS t_brand, i.model AS t_model, tp.article AS t_article,
                  i.price_by, i.price_ru, i.price_by_manual, i.price_ru_manual
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
            'price_by': r['price_by'], 'price_ru': r['price_ru'],
            'price_by_manual': r['price_by_manual'], 'price_ru_manual': r['price_ru_manual'],
        })
    return {'set': s, 'items': items}, None


# ---------- разбор ----------

def load_brands(cur):
    cur.execute("SELECT id, name, aliases FROM search_brands")
    return [{'id': r['id'], 'name': r['name'], 'aliases': list({r['name'], *(r['aliases'] or [])})}
            for r in cur.fetchall()]


def brand_by_name(brands, name):
    """Бренд справочника по названию или синониму; если нет — новый (id=None, запишется пачкой)."""
    n = re.sub(r'\s+', ' ', (name or '').strip())
    if not n:
        return None
    for b in brands:
        if n.lower() in (a.lower() for a in b['aliases']):
            return b
    b = {'id': None, 'name': n, 'aliases': [n]}
    brands.append(b)
    return b


def save_new_brands(cur, brands):
    new = [b for b in brands if b['id'] is None]
    if not new:
        return
    got = execute_values(cur, "INSERT INTO search_brands (name, aliases) VALUES %s RETURNING id, name",
                         [(b['name'], [b['name']]) for b in new], page_size=2000, fetch=True)
    ids = {r['name']: r['id'] for r in got}
    for b in new:
        b['id'] = ids.get(b['name'])


def group_ids(cur, names):
    names = sorted({n for n in names if n})
    if names:
        execute_values(cur, "INSERT INTO search_groups (name) VALUES %s ON CONFLICT (name) DO NOTHING",
                       [(n,) for n in names], page_size=2000)
    cur.execute("SELECT id, lower(name) AS n FROM search_groups")
    return {r['n']: r['id'] for r in cur.fetchall()}


ART_TAIL = re.compile(r'(\s*\(.*$|(\s+[А-Яа-яЁё][А-Яа-яЁё\-/]*)+\s*$|[А-Яа-яЁё][А-Яа-яЁё\-/]*$)')


def article_model(article):
    """Артикул без пробелов по краям, без хвоста «(…)» и русских слов (цвета) в конце.
    None — если короче 4 знаков или без цифры: тогда это не модель."""
    a = (article or '').strip()
    prev = None
    while a and a != prev:
        prev = a
        a = ART_TAIL.sub('', a).strip(' ,;/-')
    if len(a) < 4 or not re.search(r'\d', a) or not re.search(r'[A-Za-zА-Яа-яЁё]', a):
        return None
    return a


def find_article(name, art):
    """Артикул целым словом: «4211224» внутри «04211224» не считается; «:», «(», «,» — граница."""
    return re.search(r'(?<![' + WORD + r'])' + re.escape(art) + r'(?![' + WORD + r'])', name or '', re.IGNORECASE)


def by_article(name, brand_aliases, art):
    """Модель — артикул из карточки. Группа — до бренда или модели, признак — после."""
    s, quoted = cut_quoted(re.sub(r'\s+', ' ', name or '').strip())
    m = find_article(s, art)
    if not m:
        return None
    brand_match = find_brand(s, brand_aliases)
    cut = brand_match.start() if brand_match and brand_match.start() < m.start() else m.start()
    group, extra = split_group(s[:cut])
    mid = s[brand_match.end():m.start()] if brand_match and brand_match.end() <= m.start() else ''
    tail = re.sub(r'[\s,]*б/у?\.?\s*$', '', s[m.end():], flags=re.IGNORECASE)
    if brand_match and brand_match.start() > m.end():
        tail = tail.replace(brand_match.group(), ' ')
    feature = clean(' '.join(x for x in [extra, *quoted, mid, tail] if clean(x)))
    feature = clean(feature.lstrip(':,; ')) if feature else ''
    model = m.group()
    return {'group': group, 'model': model, 'feature': feature or None, 'status': model_status(group, model)}


def parse_one(brands, name, card_brand, group, article):
    """Бренд: в наименовании по справочнику → бренд карточки → папка каталога, если она есть в наименовании.
    Модель: артикул карточки, если он есть в наименовании целым словом; иначе артикул — код учёта,
    и модель достаём из наименования."""
    best, best_pos = None, None
    for b in brands:
        m = find_brand(name or '', b['aliases'])
        if m and (best_pos is None or m.start() < best_pos):
            best, best_pos = b, m.start()
    implied = False
    if not best:
        for cand in (card_brand, group):
            if cand and (cand == card_brand or find_brand(name or '', [cand])):
                best = brand_by_name(brands, cand)
                if best:
                    implied = True
                    break
    if not best:
        return None, None
    art = article_model(article)
    if art:
        res = by_article(name, best['aliases'], art)
        if res:
            return best, res
    res = parse_name(name, best['aliases'], assume_brand=implied)
    if not res:
        return None, None
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
    done = []
    for r in rows:
        st = r['parse_status'] or 'none'
        if st == 'manual' or (only_new and st != 'none'):
            counts['skipped'] += 1
            continue
        b, res = parse_one(brands, r['name'], r['brand'], r['product_group'], r['article'])
        if not b or not res:
            counts['no_brand'] += 1
            continue
        done.append((r['id'], b, res))
        counts[res['status']] += 1
    if done:
        save_new_brands(cur, brands)
        gid = group_ids(cur, [res['group'] for _, _, res in done])
        execute_values(
            cur,
            """UPDATE products p SET search_group_id = v.g, search_brand_id = v.b, model = v.m,
                      feature = v.f, parse_status = v.s
               FROM (VALUES %s) AS v(id, g, b, m, f, s)
               WHERE p.id = v.id AND COALESCE(p.parse_status, 'none') <> 'manual'""",
            [(pid, gid.get((res['group'] or '').lower()), b['id'], res['model'], res['feature'], res['status'])
             for pid, b, res in done],
            template='(%s::int, %s::int, %s::int, %s::text, %s::text, %s::text)',
            page_size=2000)
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
    brands = load_brands(cur)
    b = brand_by_name(brands, brand) if brand else None
    save_new_brands(cur, brands)
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


def _num(v, what):
    raw = str(v if v is not None else '').replace(' ', '').replace('\u00a0', '').replace(',', '.')
    if not raw:
        return None, None
    try:
        return Decimal(raw), None
    except InvalidOperation:
        return None, f'{what} — это число'


def save_percent(cur, sid, body):
    pct, err = _num(body.get('percent'), 'Процент')
    if err:
        return None, err
    if pct is not None and pct <= -100:
        return None, 'Процент должен быть больше −100'
    cur.execute("UPDATE price_sets SET percent_of_base = %s, updated_at = NOW() WHERE id = %s", (pct, sid))
    return {'percent': pct}, None


def _by_from_base(base, pct):
    return (Decimal(base) * (1 + pct / 100)).quantize(Decimal('0.01'), ROUND_HALF_UP)


def _ru_from_by(by, rate):
    return (Decimal(by) * 100 / rate).quantize(Decimal('1'), ROUND_HALF_UP)


def _by_from_ru(ru, rate):
    return (Decimal(ru) * rate / 100).quantize(Decimal('0.01'), ROUND_HALF_UP)


def _set_params(cur, sid):
    cur.execute("SELECT rate_by_per_100_rub AS rate, percent_of_base AS pct FROM price_sets WHERE id = %s", (sid,))
    s = cur.fetchone()
    if not s:
        return None, None, 'Ценовой стол не найден'
    rate = Decimal(s['rate']) if s['rate'] else None
    pct = Decimal(s['pct']) if s['pct'] is not None else None
    return rate, pct, None


def calc_prices(cur, sid, body):
    """Цена РБ = Базовая × (1 + %); Цена РФ = Цена РБ × 100 / курс. Ручные — только если include_manual."""
    rate, pct, err = _set_params(cur, sid)
    if err:
        return None, err
    if not rate or pct is None:
        return None, 'Сначала введите курс и процент'
    with_manual = bool(body.get('include_manual'))
    cur.execute(
        """SELECT i.id, i.price_by, i.price_ru, i.price_by_manual, i.price_ru_manual, p.price_base
           FROM price_set_items i
           LEFT JOIN products p ON p.id = i.product_id AND i.temp_product_id IS NULL
           WHERE i.set_id = %s""", (sid,))
    upd = []
    for r in cur.fetchall():
        by, ru = r['price_by'], r['price_ru']
        by_m, ru_m = r['price_by_manual'], r['price_ru_manual']
        if with_manual:
            by_m = ru_m = False
        if not by_m:
            by = _by_from_base(r['price_base'], pct) if r['price_base'] is not None else None
        if not ru_m:
            ru = _ru_from_by(by, rate) if by is not None else None
        if by_m and not ru_m and by is not None:
            ru = _ru_from_by(by, rate)
        if ru_m and not by_m and r['price_base'] is None and ru is not None:
            by = _by_from_ru(ru, rate)
        upd.append((r['id'], by, ru, by_m, ru_m))
    if upd:
        execute_values(
            cur,
            """UPDATE price_set_items i SET price_by = v.by, price_ru = v.ru,
                      price_by_manual = v.bm, price_ru_manual = v.rm
               FROM (VALUES %s) AS v(id, by, ru, bm, rm) WHERE i.id = v.id""",
            upd, template='(%s::int, %s::numeric, %s::numeric, %s::bool, %s::bool)', page_size=2000)
    cur.execute("UPDATE price_sets SET updated_at = NOW() WHERE id = %s", (sid,))
    return get_set(cur, sid)


def save_price(cur, sid, body):
    """Ручная правка Цены РБ или РФ. Пустое значение или reset=True — снять «вручную» и вернуть расчёт.
    Вторая цена, если она не ручная, пересчитывается по курсу."""
    field = body.get('field')
    if field not in ('by', 'ru'):
        return None, 'Неизвестная цена'
    cur.execute(
        """SELECT i.id, i.price_by, i.price_ru, i.price_by_manual, i.price_ru_manual, p.price_base
           FROM price_set_items i
           LEFT JOIN products p ON p.id = i.product_id AND i.temp_product_id IS NULL
           WHERE i.id = %s AND i.set_id = %s""", (body.get('item_id'), sid))
    r = cur.fetchone()
    if not r:
        return None, 'Товар не найден'
    rate, pct, err = _set_params(cur, sid)
    if err:
        return None, err
    val, err = _num(None if body.get('reset') else body.get('value'), 'Цена')
    if err:
        return None, err
    if val is not None and val < 0:
        return None, 'Цена не может быть меньше нуля'
    by, ru = r['price_by'], r['price_ru']
    by_m, ru_m = r['price_by_manual'], r['price_ru_manual']
    base = r['price_base']
    if field == 'by':
        if val is None:
            by_m = False
            by = _by_from_base(base, pct) if base is not None and pct is not None else None
            if by is None and ru_m and ru is not None and rate:
                by = _by_from_ru(ru, rate)
        else:
            by_m, by = True, val.quantize(Decimal('0.01'), ROUND_HALF_UP)
        if not ru_m:
            ru = _ru_from_by(by, rate) if by is not None and rate else None
    else:
        if val is None:
            ru_m = False
            ru = _ru_from_by(by, rate) if by is not None and rate else None
        else:
            ru_m, ru = True, val.quantize(Decimal('1'), ROUND_HALF_UP)
        if not by_m:
            if base is not None and pct is not None:
                by = _by_from_base(base, pct)
            else:
                by = _by_from_ru(ru, rate) if ru is not None and rate else None
    cur.execute(
        """UPDATE price_set_items SET price_by = %s, price_ru = %s, price_by_manual = %s, price_ru_manual = %s
           WHERE id = %s""", (by, ru, by_m, ru_m, r['id']))
    return {'item': {'id': r['id'], 'price_by': by, 'price_ru': ru,
                     'price_by_manual': by_m, 'price_ru_manual': ru_m}}, None


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
        elif action == 'percent':
            data, err = save_percent(cur, sid, body)
        elif action == 'calc':
            data, err = calc_prices(cur, sid, body)
        elif action == 'price':
            data, err = save_price(cur, sid, body)
        else:
            return 400, {'error': 'Неизвестное действие'}
    if err:
        return 400, {'error': err}
    return 200, data
