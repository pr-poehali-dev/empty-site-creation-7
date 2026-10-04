"""Создание товаров каталога из красных строк счёта.
Части наименования раскладываются тем же разбором, что и каталог (через match_by_name → parsed)."""
import json
from psycopg2.extras import execute_values
from parser import squash
from matcher import load_brands, detect_brand, norm_text
from parser import parse_name

NO_CATEGORY = 'Без категории'
RED = ('not_found', 'empty')


def _draft(cur, draft_id):
    cur.execute("SELECT rows_data, search_brand_id FROM invoice_drafts WHERE id = %s", (draft_id,))
    r = cur.fetchone()
    return (r[0] or [], r[1]) if r else (None, None)


def _save_rows(cur, draft_id, rows):
    cur.execute(
        "UPDATE invoice_drafts SET rows_data = %s::jsonb, updated_at = NOW(), "
        "expires_at = NOW() + INTERVAL '1 hour' WHERE id = %s",
        (json.dumps(rows, ensure_ascii=False), draft_id),
    )


def _parse_row(r, brands, by_id, default_brand_id):
    """Разбор строки: берём сохранённый parsed или разбираем тем же кодом."""
    p = r.get('parsed')
    if p and p.get('brand'):
        b = next((x for x in brands if x['name'] == p['brand']), None)
        return b, p
    b = detect_brand(r.get('name'), brands)
    implied = False
    if not b and default_brand_id in by_id:
        b, implied = by_id[default_brand_id], True
    if not b:
        return None, {'brand': None, 'group': None, 'model': None, 'feature': None, 'brand_implied': False}
    res = parse_name(r.get('name'), b['aliases'], assume_brand=implied) or {}
    return b, {'brand': b['name'], 'brand_implied': implied, 'group': res.get('group'),
               'model': res.get('model'), 'feature': res.get('feature')}


def _key(r):
    return ' '.join((r.get('name') or '').lower().split()) + '|' + (r.get('article') or '').strip().lower()


def list_folders(cur):
    cur.execute(
        """SELECT product_group, max(product_group_id), count(*) FROM products
           WHERE product_group IS NOT NULL AND product_group <> ''
           GROUP BY product_group ORDER BY lower(product_group)"""
    )
    return [{'name': r[0], 'id': r[1], 'products': r[2]} for r in cur.fetchall()]


def preview(cur, draft_id):
    rows, default_brand_id = _draft(cur, draft_id)
    if rows is None:
        return None
    brands = load_brands(cur)
    by_id = {b['id']: b for b in brands}

    groups = {}
    for i, r in enumerate(rows):
        if r.get('match_status') not in RED or r.get('product_id'):
            continue
        k = _key(r)
        if k in groups:
            groups[k]['row_indexes'].append(i)
            groups[k]['qty'] += float(r.get('qty') or 0)
            continue
        b, p = _parse_row(r, brands, by_id, default_brand_id)
        groups[k] = {
            'key': k, 'row_indexes': [i], 'name': (r.get('name') or '').strip(),
            'article': (r.get('article') or '').strip() if not r.get('article_guessed') else '',
            'barcode': (str(r.get('barcode')).strip() if r.get('barcode') else ''),
            'qty': float(r.get('qty') or 0),
            'brand_id': b['id'] if b else None, 'parsed': p,
        }
    items = list(groups.values())

    barcodes = [it['barcode'] for it in items if it['barcode']]
    bc_map = {}
    if barcodes:
        cur.execute(
            """SELECT b.barcode, p.id, p.name FROM product_barcodes b JOIN products p ON p.id = b.product_id
               WHERE b.barcode = ANY(%s) AND COALESCE(p.is_archived, false) = false""", (barcodes,))
        for bc, pid, nm in cur.fetchall():
            bc_map.setdefault(bc, {'id': pid, 'name': nm})

    arts = [it['article'] for it in items if it['article']]
    art_map = {}
    if arts:
        cur.execute(
            """SELECT upper(article), id, name FROM products
               WHERE upper(article) = ANY(%s) AND COALESCE(is_archived, false) = false""",
            ([a.upper() for a in arts],))
        for a, pid, nm in cur.fetchall():
            art_map.setdefault(a, {'id': pid, 'name': nm})

    brand_ids = list({it['brand_id'] for it in items if it['brand_id']})
    model_map = {}
    if brand_ids:
        cur.execute(
            """SELECT search_brand_id, model, feature, id, name FROM products
               WHERE search_brand_id = ANY(%s) AND model IS NOT NULL AND COALESCE(is_archived, false) = false""",
            (brand_ids,))
        for bid, m, f, pid, nm in cur.fetchall():
            model_map.setdefault((bid, squash(m)), []).append({'id': pid, 'name': nm, 'feature': f})

    for it in items:
        warn = []
        if it['barcode'] and it['barcode'] in bc_map:
            warn.append({'reason': 'Такой штрихкод уже есть', **bc_map[it['barcode']]})
        if it['article'] and it['article'].upper() in art_map:
            warn.append({'reason': 'Такой артикул уже есть', **art_map[it['article'].upper()]})
        m = it['parsed'].get('model')
        it['other_features'] = []
        if it['brand_id'] and m and (it['brand_id'], squash(m)) in model_map:
            same_model = model_map[(it['brand_id'], squash(m))]
            f = norm_text(it['parsed'].get('feature'))
            same = [x for x in same_model if norm_text(x.get('feature')) == f]
            if same:
                warn.append({'reason': 'Такая модель с таким признаком уже есть',
                             'id': same[0]['id'], 'name': same[0]['name']})
            else:
                it['other_features'] = sorted({x.get('feature') or '—' for x in same_model})
        it['duplicates'] = warn

    cur.execute("SELECT count(*) FROM products WHERE created_from_draft_id = %s AND not_in_1c = true "
                "AND COALESCE(is_archived, false) = false", (draft_id,))
    created = cur.fetchone()[0]

    default_folder = None
    if default_brand_id in by_id:
        bn = by_id[default_brand_id]['name'].lower()
        for f in list_folders(cur):
            if f['name'].lower() == bn:
                default_folder = f['name']
                break

    return {'items': items, 'folders': list_folders(cur), 'default_folder': default_folder,
            'created_count': created}


def create(cur, draft_id, items):
    rows, _ = _draft(cur, draft_id)
    if rows is None:
        return None, 'Счёт не найден'
    cur.execute("SELECT id FROM categories WHERE name = %s LIMIT 1", (NO_CATEGORY,))
    cat = cur.fetchone()
    if not cat:
        return None, 'Нет категории «Без категории»'
    folders = {f['name']: f['id'] for f in list_folders(cur)}

    brands = load_brands(cur)
    bname = {b['id']: b['name'] for b in brands}

    group_names = list({(it.get('parsed') or {}).get('group') for it in items if (it.get('parsed') or {}).get('group')})
    if group_names:
        execute_values(cur, "INSERT INTO search_groups (name) VALUES %s ON CONFLICT (name) DO NOTHING",
                       [(n,) for n in group_names])
    cur.execute("SELECT id, name FROM search_groups")
    gid = {n: i for i, n in cur.fetchall()}

    created = 0
    for it in items:
        name = (it.get('name') or '').strip()[:300]
        idxs = [int(i) for i in it.get('row_indexes') or [] if 0 <= int(i) < len(rows)]
        if not name or not idxs:
            continue
        if any(rows[i].get('product_id') for i in idxs):
            continue
        p = it.get('parsed') or {}
        folder = (it.get('folder') or '').strip() or None
        article = (it.get('article') or '').strip()[:100] or None
        bid = it.get('brand_id')
        status = 'parsed' if bid and p.get('model') else 'none'
        cur.execute(
            """INSERT INTO products (category_id, name, article, brand, product_group, product_group_id,
                   is_new, unit, writeoff_method, vat_rate, search_group_id, search_brand_id, model, feature,
                   parse_status, not_in_1c, created_from_draft_id)
               VALUES (%s, %s, %s, %s, %s, %s, FALSE, 'шт', 'FIFO', 'Без НДС', %s, %s, %s, %s, %s, TRUE, %s)
               RETURNING id""",
            (cat[0], name, article, bname.get(bid), folder, folders.get(folder),
             gid.get(p.get('group')) if bid else None, bid if bid else None,
             p.get('model') if bid else None, p.get('feature') if bid else None, status, draft_id),
        )
        pid = cur.fetchone()[0]
        bc = (it.get('barcode') or '').strip()
        if bc:
            cur.execute("INSERT INTO product_barcodes (product_id, barcode) VALUES (%s, %s)", (pid, bc[:100]))
        for i in idxs:
            rows[i]['product_id'] = pid
            rows[i]['prev_status'] = rows[i].get('match_status')
            rows[i]['match_status'] = 'created'
            rows[i]['chosen_name'] = name
        created += 1
    _save_rows(cur, draft_id, rows)
    return {'created': created, 'rows': rows}, None


def undo(cur, draft_id, product_id=None):
    rows, _ = _draft(cur, draft_id)
    if rows is None:
        return None, 'Счёт не найден'
    q = ("SELECT id FROM products WHERE created_from_draft_id = %s AND not_in_1c = true "
         "AND external_id IS NULL AND COALESCE(is_archived, false) = false")
    args = [draft_id]
    if product_id:
        q += " AND id = %s"
        args.append(product_id)
    cur.execute(q, args)
    ids = [r[0] for r in cur.fetchall()]
    if product_id and not ids:
        return None, 'Этот товар уже выгружен в 1С или отменён'
    if ids:
        cur.execute("UPDATE products SET is_archived = true, updated_at = NOW() WHERE id = ANY(%s)", (ids,))
    s = set(ids)
    for r in rows:
        if r.get('product_id') in s and r.get('match_status') == 'created':
            r.pop('product_id', None)
            r.pop('chosen_name', None)
            r['match_status'] = r.pop('prev_status', None) or 'not_found'
            if r['match_status'] not in RED:
                r['match_status'] = 'not_found'
    _save_rows(cur, draft_id, rows)
    return {'undone': len(ids), 'rows': rows}, None
