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


def find_substring(cur, articles, product_group=None, in_names=False):
    """Подстрочный поиск — только для того, что не нашлось точно."""
    keys = sorted({norm(a) for a in articles if norm(a)})
    found = {}
    if not keys:
        return found

    norm_col = SQL_NORM.format(col='article')
    name_col = SQL_NORM.format(col='name')
    group_cond = ''
    if product_group:
        group_cond = f" AND lower(product_group) = lower('{_esc(product_group)}')"

    # Один запрос на весь счёт: ключи склеиваем в список, сопоставление
    # конкретному ключу делаем уже в памяти. Запрос на каждый артикул
    # по отдельности упирался в таймаут на счетах в сотни строк.
    CHUNK = 200
    MAX_PER_KEY = 50

    for i in range(0, len(keys), CHUNK):
        part = keys[i:i + CHUNK]
        conds = []
        for k in part:
            pat = "'%" + _esc(k) + "%'"
            c = f"{norm_col} LIKE {pat}"
            if in_names:
                c = f"({c} OR {name_col} LIKE {pat})"
            conds.append(c)
        cur.execute(
            f"SELECT {FIELDS} FROM products "
            f"WHERE ({' OR '.join(conds)}) "
            f"AND COALESCE(is_archived, false) = false{group_cond} "
            f"LIMIT 3000"
        )
        rows = [_row(r) for r in cur.fetchall()]
        for k in part:
            hits = []
            for p in rows:
                hay = norm(p.get('article'))
                if hay and _is_wider_code(k, hay):
                    # 900/68/3/2 и 900/68/3/25 — разные товары, как КТ-535-1 и КТ-5351.
                    continue
                if k in hay or (in_names and k in norm(p.get('name'))):
                    hits.append(p)
                    if len(hits) >= MAX_PER_KEY:
                        break
            if hits:
                found[k] = hits
    return found


def match_rows(cur, rows, product_group=None, search_in_names=False):
    """Раскладывает строки счёта на найденные, спорные и ненайденные.

    rows — список словарей с ключами article и name.
    Возвращает тот же список, дополненный полями match_status и candidates.
    """
    articles = [r.get('article') for r in rows]
    exact = find_exact(cur, articles, product_group)

    missing = [a for a in articles if norm(a) and not exact.get(norm(a))]
    loose = {}
    if missing:
        loose = find_substring(cur, missing, product_group, search_in_names)

    result = []
    for r in rows:
        key = norm(r.get('article'))
        out = dict(r)

        if not key:
            out['match_status'] = 'empty'
            out['candidates'] = []
            result.append(out)
            continue

        cands = exact.get(key) or []
        out['match_type'] = 'exact'
        if not cands:
            cands = loose.get(key) or []
            out['match_type'] = 'substring' if cands else 'none'

        if len(cands) > 1:
            cands = sorted(
                cands,
                key=lambda c: _similarity(c.get('name'), r.get('name')),
                reverse=True,
            )

        if not cands:
            out['match_status'] = 'not_found'
            out['candidates'] = []
        elif len(cands) == 1:
            out['match_status'] = 'matched'
            out['product_id'] = cands[0]['id']
            out['candidates'] = cands
        else:
            out['match_status'] = 'ambiguous'
            out['candidates'] = cands

        result.append(out)

    return result


def summarize(rows):
    """Сводка по исходам — для шапки экрана."""
    s = {'total': len(rows), 'matched': 0, 'ambiguous': 0, 'not_found': 0, 'empty': 0}
    for r in rows:
        st = r.get('match_status')
        if st in s:
            s[st] += 1
    return s