"""Шаг «Цены»: цены из счёта в каталог, с запоминанием старых цен для отката."""
import json

FIELDS = ('price_purchase', 'price_base', 'price_retail', 'price_wholesale')
MODES = ('ready', 'calc')
FOUND = ('matched', 'manual', 'created')


def _row_price(r):
    p = r.get('price')
    if p not in (None, '', 0):
        return round(float(p), 2)
    total, qty = r.get('total'), r.get('qty')
    if total and qty:
        return round(float(total) / float(qty), 2)
    return None


def preview(cur, draft_id):
    cur.execute(
        """SELECT d.rows_data, d.supplier_id, COALESCE(s.price_field, 'price_purchase'),
                  COALESCE(s.price_mode, 'ready')
           FROM invoice_drafts d LEFT JOIN invoice_suppliers s ON s.id = d.supplier_id WHERE d.id = %s""",
        (draft_id,))
    row = cur.fetchone()
    if not row:
        return None
    rows = row[0] or []

    by_pid = {}
    for r in rows:
        pid = r.get('product_id')
        if not pid or r.get('match_status') not in FOUND:
            continue
        it = by_pid.setdefault(pid, {'product_id': pid, 'invoice_names': [], 'prices': [], 'qty': 0.0,
                                     'created': False})
        name = (r.get('name') or '').strip()
        if name and name not in it['invoice_names']:
            it['invoice_names'].append(name)
        pr = _row_price(r)
        if pr is not None and pr not in it['prices']:
            it['prices'].append(pr)
        it['qty'] += float(r.get('qty') or 0)
        if r.get('match_status') == 'created':
            it['created'] = True

    items = []
    if by_pid:
        cur.execute(
            """SELECT id, name, article, price_purchase, price_base, price_retail, price_wholesale,
                      created_from_draft_id
               FROM products WHERE id = ANY(%s)""", (list(by_pid.keys()),))
        for p in cur.fetchall():
            it = by_pid[p[0]]
            it['name'] = p[1]
            it['article'] = p[2]
            it['current'] = {f: float(p[3 + i] or 0) for i, f in enumerate(FIELDS)}
            if p[7] == draft_id:
                it['created'] = True
            it['prices'].sort()
            it['invoice_price'] = it['prices'][-1] if it['prices'] else None
            items.append(it)
    items.sort(key=lambda x: x['name'] or '')

    cur.execute(
        """SELECT price_field, count(*), max(created_at) FROM invoice_price_log
           WHERE draft_id = %s AND reverted_at IS NULL GROUP BY price_field""", (draft_id,))
    applied = [{'price_field': f, 'count': n, 'at': at.isoformat() if at else None} for f, n, at in cur.fetchall()]

    return {'items': items, 'price_field': row[2], 'price_mode': row[3], 'applied': applied}


def apply(cur, draft_id, field, mode, items):
    if field not in FIELDS:
        return None, 'Неизвестное поле цены'
    if mode not in MODES:
        mode = 'ready'
    clean = []
    for it in items:
        try:
            pid, price = int(it.get('product_id')), float(it.get('new_price'))
        except (TypeError, ValueError):
            continue
        if price < 0:
            continue
        clean.append((pid, round(price, 2)))
    if not clean:
        return None, 'Нет цен для записи'

    cur.execute("SELECT supplier_id FROM invoice_drafts WHERE id = %s", (draft_id,))
    d = cur.fetchone()
    if not d:
        return None, 'Счёт не найден'
    if d[0]:
        cur.execute("UPDATE invoice_suppliers SET price_field = %s, price_mode = %s WHERE id = %s",
                    (field, mode, d[0]))

    pids = [p for p, _ in clean]
    cur.execute(f"SELECT id, {field} FROM products WHERE id = ANY(%s)", (pids,))
    old = {r[0]: r[1] for r in cur.fetchall()}
    cur.execute(
        """SELECT product_id FROM invoice_price_log
           WHERE draft_id = %s AND price_field = %s AND reverted_at IS NULL AND product_id = ANY(%s)""",
        (draft_id, field, pids))
    logged = {r[0] for r in cur.fetchall()}

    written = 0
    for pid, price in clean:
        if pid not in old:
            continue
        cur.execute(
            f"UPDATE products SET {field} = %s, {field}_changed_at = NOW(), updated_at = NOW() WHERE id = %s",
            (price, pid))
        if pid in logged:
            cur.execute(
                """UPDATE invoice_price_log SET new_price = %s, created_at = NOW()
                   WHERE draft_id = %s AND product_id = %s AND price_field = %s AND reverted_at IS NULL""",
                (price, draft_id, pid, field))
        else:
            cur.execute(
                """INSERT INTO invoice_price_log (draft_id, product_id, price_field, old_price, new_price)
                   VALUES (%s, %s, %s, %s, %s)""", (draft_id, pid, field, old[pid], price))
        written += 1

    cur.execute("UPDATE invoice_drafts SET updated_at = NOW(), expires_at = NOW() + INTERVAL '1 hour' "
                "WHERE id = %s", (draft_id,))
    return {'written': written}, None


def revert(cur, draft_id):
    cur.execute(
        """SELECT id, product_id, price_field, old_price FROM invoice_price_log
           WHERE draft_id = %s AND reverted_at IS NULL""", (draft_id,))
    logs = cur.fetchall()
    for lid, pid, field, old_price in logs:
        if field not in FIELDS:
            continue
        cur.execute(
            f"UPDATE products SET {field} = %s, {field}_changed_at = NOW(), updated_at = NOW() WHERE id = %s",
            (old_price, pid))
        cur.execute("UPDATE invoice_price_log SET reverted_at = NOW() WHERE id = %s", (lid,))
    return {'reverted': len(logs)}, None


def dumps(x):
    return json.dumps(x, ensure_ascii=False)
