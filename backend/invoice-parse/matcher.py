"""Ядро сопоставления строк счёта с каталогом.

Сюда позже переедет и пакетный ввод заявок, поэтому модуль ничего
не знает ни про счета, ни про заявки — только артикулы и каталог.
"""

CYR = 'АВЕКМНОРСТУХ'
LAT = 'ABEKMHOPCTYX'
# Дефис НЕ отбрасываем: КТ-535-1 и КТ-5351 — разные товары.
DROP = ' №'

SQL_NORM = "translate(upper({col}), '" + CYR + DROP + "', '" + LAT + "')"

_TRANS = str.maketrans(CYR, LAT, DROP)


def norm(value):
    """Приводит артикул к виду для сравнения. Исходный артикул не меняется."""
    if value is None:
        return ''
    return str(value).upper().translate(_TRANS)


def _esc(s):
    return str(s).replace("'", "''")


def _in_list(values):
    return ','.join("'" + _esc(v) + "'" for v in values)


FIELDS = (
    'id, name, article, product_group, brand, '
    'price_base, price_retail, price_wholesale, price_purchase'
)


def _row(r):
    return {
        'id': r[0], 'name': r[1], 'article': r[2],
        'product_group': r[3], 'brand': r[4],
        'price_base': float(r[5] or 0), 'price_retail': float(r[6] or 0),
        'price_wholesale': float(r[7] or 0), 'price_purchase': float(r[8] or 0),
    }


def _is_wider_code(key, hay):
    """Кандидат — тот же код с дописанными цифрами? Значит, это другой товар.

    900/68/3/2 против 900/68/3/25, КТ-535-1 против КТ-5351. Хвост из цифр
    меняет товар, а не уточняет его.
    """
    if not hay.startswith(key) or hay == key:
        return False
    return hay[len(key):].isdigit()


def _similarity(a, b):
    """Грубая близость названий: доля общих слов. Нужна только для порядка."""
    wa = {w for w in str(a or '').lower().split() if len(w) > 2}
    wb = {w for w in str(b or '').lower().split() if len(w) > 2}
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def find_exact(cur, articles, product_group=None):
    """Точное совпадение по нормализованному артикулу. Один запрос на весь счёт."""
    keys = sorted({norm(a) for a in articles if norm(a)})
    found = {k: [] for k in keys}
    if not keys:
        return found

    norm_col = SQL_NORM.format(col='article')
    group_cond = ''
    if product_group:
        group_cond = f" AND lower(product_group) = lower('{_esc(product_group)}')"

    CHUNK = 800
    for i in range(0, len(keys), CHUNK):
        part = keys[i:i + CHUNK]
        cur.execute(
            f"SELECT {FIELDS}, {norm_col} AS k FROM products "
            f"WHERE {norm_col} IN ({_in_list(part)}) "
            f"AND COALESCE(is_archived, false) = false{group_cond}"
        )
        for r in cur.fetchall():
            found.setdefault(r[-1], []).append(_row(r))
    return found


def _distance(a, b, limit):
    """Расстояние Левенштейна с ранним выходом."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        best = cur[0]
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
            best = min(best, cur[j])
        if best > limit:
            return limit + 1
        prev = cur
    return prev[-1]


def find_in_names(cur, articles, product_group=None):
    """Артикул целым словом в наименовании товара — только точное совпадение слова."""
    keys = sorted({norm(a) for a in articles if norm(a)})
    found = {}
    if not keys:
        return found
    name_col = SQL_NORM.format(col='name')
    group_cond = ''
    if product_group:
        group_cond = f" AND lower(product_group) = lower('{_esc(product_group)}')"
    CHUNK = 200
    for i in range(0, len(keys), CHUNK):
        part = keys[i:i + CHUNK]
        conds = [f"{name_col} LIKE '%" + _esc(k) + "%'" for k in part]
        cur.execute(
            f"SELECT {FIELDS} FROM products WHERE ({' OR '.join(conds)}) "
            f"AND COALESCE(is_archived, false) = false{group_cond} LIMIT 3000"
        )
        rows = [_row(r) for r in cur.fetchall()]
        keyset = set(part)
        for p in rows:
            for tok in str(p.get('name') or '').split():
                k = norm(tok.strip(',;()[]'))
                if k in keyset:
                    found.setdefault(k, [])
                    if p not in found[k]:
                        found[k].append(p)
    return found


def find_similar(cur, articles, tolerance, product_group=None):
    """Артикулы с отличием до tolerance знаков. Только предложения — не автосовпадение."""
    keys = sorted({norm(a) for a in articles if norm(a)})
    found = {}
    if not keys or tolerance <= 0:
        return found
    group_cond = ''
    if product_group:
        group_cond = f" AND lower(product_group) = lower('{_esc(product_group)}')"
    cur.execute(
        f"SELECT {FIELDS} FROM products WHERE article IS NOT NULL AND article <> '' "
        f"AND COALESCE(is_archived, false) = false{group_cond}"
    )
    by_len = {}
    for r in cur.fetchall():
        p = _row(r)
        k = norm(p['article'])
        if k:
            by_len.setdefault(len(k), []).append((k, p))
    for key in keys:
        hits = []
        for ln in range(len(key) - tolerance, len(key) + tolerance + 1):
            for k, p in by_len.get(ln, []):
                if k == key or k[0] != key[0]:
                    continue
                d = _distance(key, k, tolerance)
                if d <= tolerance:
                    hits.append({**p, 'distance': d})
        if hits:
            hits.sort(key=lambda c: c['distance'])
            found[key] = hits[:15]
    return found


def match_rows(cur, rows, product_group=None, search_in_names=False, tolerance=0):
    """Раскладывает строки счёта на найденные, спорные и ненайденные.

    tolerance = 0 — только точное совпадение артикула (или целого слова в наименовании).
    tolerance 1–2 — похожие артикулы предлагаются на выбор, но никогда не ставятся сами.
    """
    articles = [r.get('article') for r in rows]
    exact = find_exact(cur, articles, product_group)

    missing = [a for a in articles if norm(a) and not exact.get(norm(a))]
    in_names = find_in_names(cur, missing, product_group) if (missing and search_in_names) else {}
    missing = [a for a in missing if not in_names.get(norm(a))]
    similar = find_similar(cur, missing, tolerance, product_group) if missing else {}

    result = []
    for r in rows:
        key = norm(r.get('article'))
        out = dict(r)
        out.pop('match_reason', None)

        if not key:
            out['match_status'] = 'empty'
            out['candidates'] = []
            result.append(out)
            continue

        cands = exact.get(key) or []
        out['match_type'] = 'exact'
        if not cands and in_names.get(key):
            cands = in_names[key]
            out['match_type'] = 'in_name'

        if cands:
            if len(cands) > 1:
                cands = sorted(cands, key=lambda c: _similarity(c.get('name'), r.get('name')), reverse=True)
                out['match_status'] = 'ambiguous'
            else:
                out['match_status'] = 'matched'
                out['product_id'] = cands[0]['id']
            out['candidates'] = cands
        elif similar.get(key):
            out['match_type'] = 'similar'
            out['match_status'] = 'suggested'
            out['candidates'] = similar[key]
        else:
            out['match_type'] = 'none'
            out['match_status'] = 'not_found'
            out['match_reason'] = 'no_article_in_catalog'
            out['candidates'] = []

        result.append(out)

    return result


def summarize(rows):
    """Сводка по исходам — для шапки экрана."""
    s = {'total': len(rows), 'matched': 0, 'ambiguous': 0, 'suggested': 0, 'not_found': 0, 'empty': 0}
    for r in rows:
        st = r.get('match_status')
        if st in s:
            s[st] += 1
    return s