"""Сверка каталога поставщика с нашей номенклатурой."""

NORM_SQL = "translate(upper({col}), 'АВЕКМНОРСТУХ №', 'ABEKMHOPCTYX')"

FILL_FIELDS = [
    ('tnved', 'tnved_code', 'Код ТНВЭД'),
    ('weight_gross', 'weight_gross', 'Вес брутто'),
    ('weight_net', 'weight_net', 'Вес нетто'),
]


def norm_article(a):
    if not a:
        return ''
    return a.upper().translate(str.maketrans('АВЕКМНОРСТУХ №', 'ABEKMHOPCTYX  ')).replace(' ', '')


def _same(a, b):
    try:
        return abs(float(a) - float(b)) < 0.0005
    except (TypeError, ValueError):
        return str(a).strip() == str(b).strip()


def match_items(cur, items):
    """Ищет товары по нормализованному артикулу. Возвращает карту row -> product."""
    arts = {}
    for it in items:
        na = norm_article(it.get('article'))
        if na:
            arts.setdefault(na, []).append(it['row'])
    if not arts:
        return {}, {}

    keys = list(arts.keys())
    found = {}
    chunk = 2000
    for i in range(0, len(keys), chunk):
        part = keys[i:i + chunk]
        vals = ','.join("'" + k.replace("'", "''") + "'" for k in part)
        cur.execute(
            "SELECT id, article, tnved_code, weight_gross, weight_net, "
            + NORM_SQL.format(col='article') + " AS na, name "
            "FROM products WHERE " + NORM_SQL.format(col='article') + " IN (" + vals + ")"
        )
        for r in cur.fetchall():
            found.setdefault(r[5], {
                'id': r[0], 'article': r[1], 'tnved_code': r[2],
                'weight_gross': r[3], 'weight_net': r[4], 'name': r[6],
            })

    row_map = {}
    for na, rows in arts.items():
        p = found.get(na)
        if p:
            for rw in rows:
                row_map[rw] = p
    return row_map, found


def item_codes(it):
    codes = it.get('barcodes')
    if codes is None:
        bc = str(it.get('barcode') or '').strip()
        codes = [bc] if bc else []
    return [str(c).strip() for c in codes if str(c).strip()]


def list_row(it):
    return {'article': it.get('article') or '', 'name': it.get('name') or '',
            'barcodes': item_codes(it), 'category': it.get('category') or ''}


def existing_barcodes(cur, codes):
    """Возвращает множество уже занятых штрихкодов."""
    codes = [c for c in codes if c]
    if not codes:
        return set()
    out = set()
    chunk = 2000
    for i in range(0, len(codes), chunk):
        part = codes[i:i + chunk]
        vals = ','.join("'" + str(c).replace("'", "''") + "'" for c in part)
        cur.execute("SELECT barcode FROM product_barcodes WHERE barcode IN (" + vals + ")")
        out.update(r[0] for r in cur.fetchall())
    return out


def build_report(cur, items):
    """Отчёт: новые, существующие, что можно дополнить, двойные штрихкоды."""
    row_map, _ = match_items(cur, items)

    new_rows, exist_rows = [], []
    for it in items:
        (exist_rows if it['row'] in row_map else new_rows).append(it)

    fill = []
    for src, col, title in FILL_FIELDS:
        empty_cnt = 0
        differ_cnt = 0
        for it in exist_rows:
            val = it.get(src)
            if val in (None, ''):
                continue
            p = row_map[it['row']]
            cur_val = p.get(col)
            if cur_val in (None, ''):
                empty_cnt += 1
            elif not _same(cur_val, val):
                differ_cnt += 1
        if empty_cnt or differ_cnt:
            fill.append({
                'field': src, 'title': title,
                'empty': empty_cnt, 'differ': differ_cnt,
            })

    file_codes = {}
    for it in items:
        for bc in item_codes(it):
            file_codes.setdefault(bc, 0)
            file_codes[bc] += 1
    dup_in_file = sum(1 for v in file_codes.values() if v > 1)
    taken = existing_barcodes(cur, list(file_codes.keys()))

    return {
        'total': len(items),
        'new_items': [list_row(it) for it in new_rows],
        'exist_items': [dict(list_row(it), match=row_map[it['row']].get('name') or '',
                             match_article=row_map[it['row']].get('article') or '')
                        for it in exist_rows],
        'new_count': len(new_rows),
        'exist_count': len(exist_rows),
        'fill': fill,
        'barcodes': {
            'total': len(file_codes),
            'dup_in_file': dup_in_file,
            'already_taken': len(taken),
            'to_add': len(file_codes) - len(taken),
        },
    }, row_map