"""Сопоставление строк счёта с каталогом по наименованию.
Строка счёта разбирается тем же parse_name, что и карточки каталога."""
import json
import re
from parser import parse_name, find_brand, squash, TAIL_BU

FIELDS = (
    "p.id, p.name, p.article, p.product_group, p.brand, p.price_base, p.price_retail, "
    "p.price_wholesale, p.price_purchase, p.model, p.feature, g.name, p.search_brand_id"
)


def load_brands(cur):
    cur.execute("SELECT id, name, aliases FROM search_brands")
    out = []
    for bid, name, aliases in cur.fetchall():
        out.append({'id': bid, 'name': name, 'aliases': list({name, *(aliases or [])})})
    return out


def detect_brand(name, brands):
    best, best_pos = None, None
    for b in brands:
        m = find_brand(name or '', b['aliases'])
        if m and (best_pos is None or m.start() < best_pos):
            best, best_pos = b, m.start()
    return best


def load_catalog(cur, brand_ids):
    if not brand_ids:
        return {}
    ids = ','.join(str(int(i)) for i in brand_ids)
    cur.execute(
        f"""SELECT {FIELDS} FROM products p
            LEFT JOIN search_groups g ON g.id = p.search_group_id
            WHERE p.search_brand_id IN ({ids}) AND COALESCE(p.is_archived, false) = false
              AND p.model IS NOT NULL AND p.model <> ''"""
    )
    by_brand = {}
    for r in cur.fetchall():
        c = {
            'id': r[0], 'name': r[1], 'article': r[2], 'product_group': r[3], 'brand': r[4],
            'price_base': float(r[5] or 0), 'price_retail': float(r[6] or 0),
            'price_wholesale': float(r[7] or 0), 'price_purchase': float(r[8] or 0),
            'model': r[9], 'feature': r[10], 'search_group': r[11],
        }
        idx = by_brand.setdefault(r[12], {})
        idx.setdefault(squash(r[9]), []).append(c)
    return by_brand


def norm_text(s):
    """Для сравнения признаков и наименований: без б/у, регистра, ё/е, пробелов и знаков."""
    s = TAIL_BU.sub('', s or '').lower().replace('ё', 'е')
    return re.sub(r'[^0-9a-zа-я]', '', s)


def pick_exact(p, row_name, cands):
    """Из товаров с той же моделью выбирает единственный по признаку или по полному наименованию."""
    f = norm_text(p.get('feature'))
    same = [c for c in cands if norm_text(c.get('feature')) == f]
    if len(same) == 1:
        return same[0], 'exact_feature'
    n = norm_text(row_name)
    same_name = [c for c in cands if norm_text(c.get('name')) == n]
    if len(same_name) == 1:
        return same_name[0], 'exact_name'
    return None, None


def words(s):
    return {squash(w) for w in (s or '').replace(',', ' ').split() if len(squash(w)) > 1}


def closeness(row, c):
    """Для порядка вариантов: совпадение группы + доля общих слов признака."""
    score = 0.0
    if row.get('group') and c.get('search_group') and row['group'].lower() == c['search_group'].lower():
        score += 1.0
    a, b = words(row.get('feature')), words(c.get('feature'))
    if a and b:
        score += len(a & b) / len(a | b)
    elif not a and not b:
        score += 0.5
    return score


def distance(a, b, limit):
    """Расстояние Левенштейна с ранним выходом, если превысили limit."""
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


def fuzzy(key, index):
    limit = 1 if len(key) < 6 else 2
    found = []
    for k, items in index.items():
        if not k or k[0] != key[0]:
            continue
        d = distance(key, k, limit)
        if d <= limit:
            found.append((d, items))
    found.sort(key=lambda x: x[0])
    out = []
    for d, items in found:
        for c in items:
            out.append({**c, 'distance': d})
    return out


def match_by_name(cur, rows, brand_id=None):
    brands = load_brands(cur)
    by_id = {b['id']: b for b in brands}
    default = by_id.get(brand_id) if brand_id else None

    parsed_rows = []
    used = set()
    for r in rows:
        b = detect_brand(r.get('name'), brands)
        implied = False
        if not b and default:
            b, implied = default, True
        p = parse_name(r.get('name'), b['aliases'], assume_brand=implied) if b else None
        parsed_rows.append((b, implied, p))
        if b:
            used.add(b['id'])

    catalog = load_catalog(cur, used)

    out = []
    for r, (b, implied, p) in zip(rows, parsed_rows):
        row = {k: v for k, v in r.items()
               if k not in ('candidates', 'product_id', 'match_type', 'match_reason', 'chosen_name', 'match_status', 'prev_status', 'catalog_features')}
        row['parsed'] = {
            'brand': b['name'] if b else None,
            'brand_implied': implied,
            'group': p and p['group'],
            'model': p and p['model'],
            'feature': p and p['feature'],
        }
        row['candidates'] = []

        if not b:
            row['match_status'], row['match_reason'] = 'not_found', 'no_brand'
        elif b['id'] not in catalog:
            row['match_status'], row['match_reason'] = 'unparsed', 'brand_not_parsed'
        elif not p or not p['model']:
            row['match_status'], row['match_reason'] = 'not_found', 'no_model'
        else:
            index = catalog[b['id']]
            key = squash(p['model'])
            exact = index.get(key, [])
            ref = {'group': p['group'], 'feature': p['feature']}
            if exact:
                cands = sorted(exact, key=lambda c: -closeness(ref, c))
                row['match_type'] = 'exact'
                hit, how = pick_exact(p, r.get('name'), cands)
                if hit:
                    row['match_status'] = 'matched'
                    row['match_type'] = how
                    row['product_id'] = hit['id']
                    row['chosen_name'] = hit['name']
                    cands = [hit] + [c for c in cands if c['id'] != hit['id']]
                else:
                    row['match_status'] = 'ambiguous'
                    f = norm_text(p.get('feature'))
                    if len(cands) == 1:
                        row['match_reason'] = 'feature_differs'
                    elif any(norm_text(c.get('feature')) == f for c in cands):
                        row['match_reason'] = 'feature_many'
                    else:
                        row['match_reason'] = 'feature_not_found'
                    row['catalog_features'] = sorted({c.get('feature') or '—' for c in cands})
                row['candidates'] = cands[:30]
            else:
                cands = fuzzy(key, index) if key else []
                if cands:
                    cands.sort(key=lambda c: (c['distance'], -closeness(ref, c)))
                    row['match_type'] = 'similar'
                    row['match_status'] = 'suggested'
                    row['candidates'] = cands[:15]
                else:
                    row['match_status'], row['match_reason'] = 'not_found', 'no_model_in_catalog'
        out.append(row)
    return out


def summarize(rows):
    s = {k: 0 for k in ('total', 'matched', 'suggested', 'ambiguous', 'not_found', 'empty', 'manual', 'unparsed', 'created')}
    s['total'] = len(rows)
    for r in rows:
        st = r.get('match_status')
        if st in s:
            s[st] += 1
    return s


def match_draft(cur, draft_id, brand_id=None):
    cur.execute(f"SELECT rows_data FROM invoice_drafts WHERE id = {int(draft_id)}")
    row = cur.fetchone()
    if not row:
        return None
    rows = row[0] or []
    manual = {i: (r['product_id'], r.get('chosen_name'), r['match_status'], r.get('prev_status'))
              for i, r in enumerate(rows)
              if r.get('match_status') in ('manual', 'created') and r.get('product_id')}

    matched = match_by_name(cur, rows, brand_id)
    for i, (pid, cname, st, prev) in manual.items():
        if i < len(matched):
            matched[i]['match_status'] = st
            matched[i]['product_id'] = pid
            if cname:
                matched[i]['chosen_name'] = cname
            if prev:
                matched[i]['prev_status'] = prev

    cur.execute(
        "UPDATE invoice_drafts SET rows_data = %s::jsonb, stage = 'matched', match_mode = 'name', "
        "search_brand_id = %s, updated_at = NOW(), expires_at = NOW() + INTERVAL '1 hour' WHERE id = %s",
        (json.dumps(matched, ensure_ascii=False), brand_id, int(draft_id)),
    )
    return {'rows': matched, 'summary': summarize(matched), 'mode': 'name', 'brand_id': brand_id}