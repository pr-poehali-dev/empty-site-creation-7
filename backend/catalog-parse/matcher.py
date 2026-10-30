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


def _fold(s):
    return ' '.join(str(s or '').split()).lower()


def expected_group(it, opts):
    """Группа, в которой товар строки ищется в первую очередь. None — искать по всему каталогу."""
    opts = opts or {}
    if opts.get('mode') == 'brand':
        bmap = {_fold(k): v for k, v in (opts.get('brand_groups') or {}).items()}
        g = bmap.get(_fold(it.get('brand')))
    else:
        g = opts.get('product_group')
    g = ' '.join(str(g or '').split())
    return g or None


def _candidates(cur, items):
    keys = sorted({norm_article(it.get('article')) for it in items if norm_article(it.get('article'))})
    found = {}
    for i in range(0, len(keys), 2000):
        part = keys[i:i + 2000]
        vals = ','.join("'" + k.replace("'", "''") + "'" for k in part)
        cur.execute(
            "SELECT id, article, tnved_code, weight_gross, weight_net, "
            + NORM_SQL.format(col='article') + " AS na, name, product_group "
            "FROM products WHERE " + NORM_SQL.format(col='article') + " IN (" + vals + ") ORDER BY id"
        )
        for r in cur.fetchall():
            found.setdefault(r[5], []).append({
                'id': r[0], 'article': r[1], 'tnved_code': r[2],
                'weight_gross': r[3], 'weight_net': r[4], 'name': r[6], 'group': r[7] or '',
            })
    return found


def resolve(cur, items, opts=None, decisions=None):
    """Поиск сначала в группе строки, потом по всему каталогу.

    Возвращает dict: row_map (строка -> карточка для обновления), conflicts (найдены только в другой
    группе), skip (строки, которые решили пропустить), moves (id карточки -> группа для переноса).
    """
    found = _candidates(cur, items)
    decisions = decisions or {}
    row_map, conflicts, skip, moves = {}, [], set(), {}
    for it in items:
        cands = found.get(norm_article(it.get('article'))) or []
        if not cands:
            continue
        g = expected_group(it, opts)
        if not g:
            row_map[it['row']] = cands[0]
            continue
        inside = [c for c in cands if _fold(c['group']) == _fold(g)]
        if inside:
            row_map[it['row']] = inside[0]
            continue
        dec = decisions.get(str(it['row'])) or {}
        act = dec.get('action')
        pick = next((c for c in cands if c['id'] == dec.get('product_id')), None)
        if act in ('update', 'move') and pick:
            row_map[it['row']] = pick
            if act == 'move':
                moves[pick['id']] = g
        elif act == 'skip':
            skip.add(it['row'])
        elif act != 'new':
            act = None
        conflicts.append({
            **list_row(it), 'expected_group': g, 'action': act,
            'product_id': pick['id'] if pick else cands[0]['id'],
            'cards': [{'id': c['id'], 'article': c['article'] or '', 'name': c['name'] or '',
                       'group': c['group']} for c in cands[:5]],
        })
    return {'row_map': row_map, 'conflicts': conflicts, 'skip': skip, 'moves': moves,
            'undecided': sum(1 for c in conflicts if not c['action'])}


def match_items(cur, items):
    """Поиск по артикулу по всему каталогу. Возвращает карту row -> product."""
    res = resolve(cur, items)
    return res['row_map'], {}


def item_codes(it):
    codes = it.get('barcodes')
    if codes is None:
        bc = str(it.get('barcode') or '').strip()
        codes = [bc] if bc else []
    return [str(c).strip() for c in codes if str(c).strip()]


def list_row(it):
    return {'row': it.get('row'), 'article': it.get('article') or '', 'name': it.get('name') or '',
            'barcodes': item_codes(it), 'category': it.get('category') or ''}


def existing_barcodes(cur, codes):
    """Возвращает карту занятых штрихкодов: штрихкод -> карточка каталога."""
    codes = [c for c in codes if c]
    if not codes:
        return {}
    out = {}
    chunk = 2000
    for i in range(0, len(codes), chunk):
        part = codes[i:i + chunk]
        vals = ','.join("'" + str(c).replace("'", "''") + "'" for c in part)
        cur.execute(
            "SELECT b.barcode, p.id, p.article, p.name FROM product_barcodes b "
            "LEFT JOIN products p ON p.id = b.product_id WHERE b.barcode IN (" + vals + ")"
        )
        for r in cur.fetchall():
            out.setdefault(r[0], {'id': r[1], 'article': r[2] or '', 'name': r[3] or ''})
    return out


def build_report(cur, items, opts=None, decisions=None):
    """Отчёт: новые, существующие, найденные в другой группе, что можно дополнить."""
    res = resolve(cur, items, opts, decisions)
    row_map = res['row_map']
    conflict_rows = {c['row'] for c in res['conflicts'] if c['action'] in (None, 'skip')}

    new_rows, exist_rows = [], []
    for it in items:
        if it['row'] in conflict_rows:
            continue
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

    return {
        'total': len(items),
        'new_items': [list_row(it) for it in new_rows],
        'exist_items': [dict(list_row(it), match=row_map[it['row']].get('name') or '',
                             match_article=row_map[it['row']].get('article') or '')
                        for it in exist_rows],
        'new_count': len(new_rows),
        'exist_count': len(exist_rows),
        'conflicts': res['conflicts'],
        'conflict_count': len(res['conflicts']),
        'undecided': res['undecided'],
        'fill': fill,
    }, row_map


def barcode_report(cur, items, opts=None, decisions=None):
    """Сверка штрихкодов файла с каталогом после загрузки товаров."""
    res = resolve(cur, items, opts, decisions)
    row_map = res['row_map']
    file_codes = {}
    for it in items:
        if it['row'] in res['skip']:
            continue
        for bc in item_codes(it):
            file_codes.setdefault(bc, []).append(it)
    taken = existing_barcodes(cur, list(file_codes.keys()))

    groups = {'all': [], 'own': [], 'add': [], 'foreign': [], 'dups': []}
    for bc, owners in file_codes.items():
        it = owners[0]
        mine = row_map.get(it['row'])
        row = {'barcode': bc, 'article': it.get('article') or '', 'name': it.get('name') or '',
               'dup_count': len(owners),
               'dup_articles': [o.get('article') or '' for o in owners[1:]]}
        p = taken.get(bc)
        if p:
            foreign = not mine or mine.get('id') != p['id']
            row.update(taken=True, match=p['name'], match_article=p['article'], foreign=foreign)
            groups['foreign' if foreign else 'own'].append(row)
        else:
            row.update(taken=False, no_product=not mine)
            groups['add'].append(row)
        if len(owners) > 1:
            groups['dups'].append(row)
        groups['all'].append(row)
    counts = {k: len(v) for k, v in groups.items()}
    return {'counts': counts, 'items': groups}