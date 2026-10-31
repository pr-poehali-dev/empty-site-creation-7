"""Шаг «Цены» загрузки каталога: цены из файла в карточки, сопоставленные на шаге товаров."""
import json

FIELDS = ('price_purchase', 'price_base', 'price_retail', 'price_wholesale')
FILE_PRICES = {'price_retail': 'Розничная цена', 'price_wholesale': 'Оптовая цена', 'price': 'Цена'}


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 2) if f > 0 else None


def preview(cur, d, items):
    """items — строки файла после фильтров. Сопоставление — из row_products черновика."""
    rp = d.get('row_products') or {}
    by_pid = {}
    for it in items:
        pid = rp.get(str(it['row']))
        if not pid:
            continue
        e = by_pid.setdefault(int(pid['id']), {'product_id': int(pid['id']), 'file_names': [], 'file': {},
                                               'created': False, 'rows': 0})
        e['rows'] += 1
        if pid.get('created'):
            e['created'] = True
        n = (it.get('name') or '').strip()
        if n and n not in e['file_names']:
            e['file_names'].append(n)
        for k in FILE_PRICES:
            v = _num(it.get(k))
            if v is not None:
                lst = e['file'].setdefault(k, [])
                if v not in lst:
                    lst.append(v)
    out = []
    if by_pid:
        cur.execute("SELECT id, name, article, price_purchase, price_base, price_retail, price_wholesale "
                    "FROM products WHERE id IN (" + ','.join(str(i) for i in by_pid) + ")")
        for r in cur.fetchall():
            e = by_pid[r[0]]
            e['name'], e['article'] = r[1] or '', r[2] or ''
            e['current'] = {f: float(r[3 + i] or 0) for i, f in enumerate(FIELDS)}
            for k in e['file']:
                e['file'][k].sort()
            out.append(e)
    out.sort(key=lambda x: x['name'])
    sources = [{'value': k, 'label': t} for k, t in FILE_PRICES.items()
               if any(k in e['file'] for e in out)]
    cur.execute("SELECT price_field, count(*) FROM catalog_price_log WHERE draft_id = %s AND reverted_at IS NULL "
                "GROUP BY price_field", (d['id'],))
    applied = [{'price_field': f, 'count': n} for f, n in cur.fetchall()]
    settings = {}
    if d.get('supplier_id'):
        cur.execute("SELECT price_settings FROM catalog_suppliers WHERE id = %s", (d['supplier_id'],))
        row = cur.fetchone()
        settings = (row[0] if row else None) or {}
    return {'items': out, 'sources': sources, 'applied': applied, 'settings': settings,
            'file_name': d.get('file_name'), 'supplier_name': d.get('supplier_name')}


def apply(cur, d, field, items, settings):
    if field not in FIELDS:
        return None, 'Неизвестное поле цены'
    allowed = {int(v['id']) for v in (d.get('row_products') or {}).values()}
    clean = {}
    for it in items or []:
        try:
            pid, price = int(it.get('product_id')), round(float(it.get('new_price')), 2)
        except (TypeError, ValueError):
            continue
        if price >= 0 and pid in allowed:
            clean[pid] = price
    if not clean:
        return None, 'Нет цен для записи'
    skipped_parsed = 0
    if field == 'price_base':
        cur.execute("SELECT id FROM products WHERE price_base_parsed AND id IN ("
                    + ','.join(str(int(p)) for p in clean) + ")")
        for r in cur.fetchall():
            clean.pop(r[0], None)
            skipped_parsed += 1
        if not clean:
            return {'written': 0, 'skipped_parsed': skipped_parsed}, None
    did = int(d['id'])
    vals = ','.join(f"({p}, {v})" for p, v in clean.items())
    if field == 'price_base':
        cur.execute(
            f"INSERT INTO price_base_history (product_id, old_price, new_price, source, draft_id) "
            f"SELECT p.id, p.price_base, v.price, 'catalog_upload', {did} FROM (VALUES {vals}) AS v(id, price) "
            f"JOIN products p ON p.id = v.id WHERE p.price_base IS DISTINCT FROM v.price")
    cur.execute(
        f"INSERT INTO catalog_price_log (draft_id, product_id, price_field, old_price, new_price) "
        f"SELECT {did}, p.id, '{field}', p.{field}, v.price FROM (VALUES {vals}) AS v(id, price) "
        f"JOIN products p ON p.id = v.id WHERE NOT EXISTS (SELECT 1 FROM catalog_price_log l "
        f"WHERE l.draft_id = {did} AND l.product_id = p.id AND l.price_field = '{field}' AND l.reverted_at IS NULL)")
    cur.execute(
        f"UPDATE catalog_price_log l SET new_price = v.price, created_at = NOW() FROM (VALUES {vals}) AS v(id, price) "
        f"WHERE l.product_id = v.id AND l.draft_id = {did} AND l.price_field = '{field}' AND l.reverted_at IS NULL")
    cur.execute(
        f"UPDATE products p SET {field} = v.price, {field}_changed_at = NOW(), updated_at = NOW() "
        f"FROM (VALUES {vals}) AS v(id, price) WHERE p.id = v.id")
    written = cur.rowcount
    if d.get('supplier_id') and isinstance(settings, dict):
        cur.execute("UPDATE catalog_suppliers SET price_settings = %s WHERE id = %s",
                    (json.dumps(settings, ensure_ascii=False), d['supplier_id']))
    cur.execute("UPDATE catalog_drafts SET expires_at = NOW() + INTERVAL '7 days' WHERE id = %s", (did,))
    return {'written': written, 'skipped_parsed': skipped_parsed}, None


def revert(cur, draft_id):
    cur.execute("SELECT id, product_id, price_field, old_price FROM catalog_price_log "
                "WHERE draft_id = %s AND reverted_at IS NULL", (draft_id,))
    logs = cur.fetchall()
    for f in FIELDS:
        vals = [(pid, old) for _, pid, fld, old in logs if fld == f]
        if vals:
            v = ','.join(f"({int(p)}, {'NULL' if o is None else float(o)})" for p, o in vals)
            cur.execute(f"UPDATE products p SET {f} = v.price::numeric, {f}_changed_at = NOW(), updated_at = NOW() "
                        f"FROM (VALUES {v}) AS v(id, price) WHERE p.id = v.id")
    if logs:
        cur.execute("UPDATE catalog_price_log SET reverted_at = NOW() WHERE id IN ("
                    + ','.join(str(l[0]) for l in logs) + ")")
    return {'reverted': len(logs)}, None
