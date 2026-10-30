"""Сверка товаров из накладных 1С с каталогом сайта по артикулу, наименованию и штрихкоду."""
import re

CYR, LAT = 'АВЕКМНОРСТУХ', 'ABEKMHOPCTYX'
DROP = ' №'
_TRANS = str.maketrans(CYR, LAT, DROP)
ART_SQL = "translate(upper({col}), '" + CYR + DROP + "', '" + LAT + "')"
FIELDS = ('article', 'name', 'barcode')


def norm_art(v):
    return str(v or '').upper().translate(_TRANS)


def norm_name(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip().lower()


def _esc(s):
    return str(s).replace("'", "''")


def _vals(xs):
    return ','.join("'" + _esc(x) + "'" for x in xs)


def _card(r):
    return {'id': r[0], 'article': r[1] or '', 'name': r[2] or '', 'group': r[3] or ''}


BASE = "SELECT id, article, name, product_group FROM products WHERE COALESCE(is_archived, false) = false"


def _load(cur):
    cur.execute(BASE)
    by_art, by_name, by_word = {}, {}, {}
    for r in cur.fetchall():
        c = _card(r)
        a = norm_art(c['article'])
        if a:
            by_art.setdefault(a, []).append(c)
        n = norm_name(c['name'])
        if n:
            by_name.setdefault(n, []).append(c)
        for tok in set(str(c['name']).split()):
            k = norm_art(tok.strip(',;()[]{}'))
            if k:
                lst = by_word.setdefault(k, [])
                if not lst or lst[-1]['id'] != c['id']:
                    lst.append(c)
    return by_art, by_name, by_word


def _by_barcode(cur, codes):
    out = {}
    codes = sorted(codes)
    for i in range(0, len(codes), 1000):
        part = codes[i:i + 1000]
        cur.execute("SELECT p.id, p.article, p.name, p.product_group, b.barcode FROM product_barcodes b "
                    "JOIN products p ON p.id = b.product_id "
                    f"WHERE b.barcode IN ({_vals(part)}) AND COALESCE(p.is_archived, false) = false")
        for r in cur.fetchall():
            lst = out.setdefault(r[4], [])
            if all(c['id'] != r[0] for c in lst):
                lst.append(_card(r))
    return out


def match(cur, items, fields):
    fields = [f for f in FIELDS if f in (fields or [])]
    if not fields:
        return None, 'Не выбраны параметры сверки'
    rows = []
    for it in items[:3000]:
        rows.append({
            'key': str(it.get('key') or ''),
            'article': norm_art(it.get('article')) if 'article' in fields else '',
            'name': norm_name(it.get('name')) if 'name' in fields else '',
            'barcodes': [str(b).strip() for b in (it.get('barcodes') or []) if str(b).strip()] if 'barcode' in fields else [],
        })
    need_cat = any(r['article'] or r['name'] for r in rows)
    by_art, by_name, by_word = _load(cur) if need_cat else ({}, {}, {})
    in_name = by_word
    codes = {b for r in rows for b in r['barcodes']}
    by_bc = _by_barcode(cur, codes) if codes else {}

    out = {}
    for r in rows:
        filled = [f for f in fields if (r['barcodes'] if f == 'barcode' else r[f])]
        cards = {}

        def add(lst, f, flag=None):
            for c in lst or []:
                e = cards.setdefault(c['id'], dict(c, matched=[]))
                if f not in e['matched']:
                    e['matched'].append(f)
                if flag:
                    e[flag] = True

        if r['article']:
            if by_art.get(r['article']):
                add(by_art[r['article']], 'article')
            else:
                add(in_name.get(r['article']), 'article', 'in_name')
        if r['name']:
            add(by_name.get(r['name']), 'name')
        for b in r['barcodes']:
            add(by_bc.get(b), 'barcode')

        lst = sorted(cards.values(), key=lambda c: (-len(c['matched']), c['name']))
        if not filled or not lst:
            status = 'missing'
        elif any(all(f in c['matched'] for f in filled) for c in lst):
            status = 'found'
        else:
            status = 'partial'
        out[r['key']] = {'status': status, 'cards': lst[:10]}
    return {'items': out}, None
