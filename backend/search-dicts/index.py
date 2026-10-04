"""Справочники для поиска (бренды, товарные группы) и поля разбора товара. Только для владельца."""
import json
import os
import psycopg2
from psycopg2.extras import execute_values
from parser import parse_name
from matcher import match_draft
import creator
import prices


def find_products(cur, q, brand_id=None):
    """Ручной поиск товара: все слова запроса должны встретиться в названии, артикуле или модели."""
    words = [w for w in (q or '').split() if w][:6]
    if not words:
        return []
    conds, vals = [], []
    for w in words:
        conds.append("(p.name ILIKE %s OR p.article ILIKE %s OR p.model ILIKE %s)")
        vals += [f'%{w}%'] * 3
    order = ''
    if brand_id:
        order = 'CASE WHEN p.search_brand_id = %s THEN 0 ELSE 1 END, '
        vals.append(brand_id)
    cur.execute(
        f"""SELECT p.id, p.name, p.article, p.model, p.feature, g.name
            FROM products p LEFT JOIN search_groups g ON g.id = p.search_group_id
            WHERE COALESCE(p.is_archived, false) = false AND {' AND '.join(conds)}
            ORDER BY {order}p.name LIMIT 30""",
        vals,
    )
    return [{'id': r[0], 'name': r[1], 'article': r[2], 'model': r[3], 'feature': r[4], 'search_group': r[5]}
            for r in cur.fetchall()]


def brand_products(cur, brand_id):
    cur.execute("SELECT name, aliases FROM search_brands WHERE id = %s", (brand_id,))
    b = cur.fetchone()
    if not b:
        return None, []
    aliases = list({b[0], *(b[1] or [])})
    conds = ' OR '.join(['p.name ILIKE %s'] * len(aliases))
    cur.execute(
        f"""SELECT p.id, p.name, p.article, p.parse_status FROM products p
            WHERE COALESCE(p.is_archived, false) = false AND ({conds}) ORDER BY p.id""",
        [f'%{a}%' for a in aliases],
    )
    return {'id': brand_id, 'name': b[0], 'aliases': aliases}, cur.fetchall()


def run_parse(cur, brand_id, apply):
    brand, rows = brand_products(cur, brand_id)
    if not brand:
        return resp(404, {'error': 'Бренд не найден'})
    results, skipped_manual = [], 0
    for pid, name, article, status in rows:
        r = parse_name(name, brand['aliases'])
        if not r:
            continue
        if status == 'manual':
            skipped_manual += 1
            continue
        results.append({'id': pid, 'name': name, 'article': article, **r})

    counts = {'parsed': 0, 'doubtful': 0}
    groups = {}
    for r in results:
        counts[r['status']] += 1
        if r['group']:
            groups[r['group']] = groups.get(r['group'], 0) + 1

    if not apply:
        return resp(200, {
            'brand': brand['name'], 'total': len(results), 'counts': counts,
            'skipped_manual': skipped_manual,
            'groups': sorted(groups.items(), key=lambda x: x[0].lower()),
            'items': results,
        })

    names = list(groups.keys())
    if names:
        execute_values(cur, "INSERT INTO search_groups (name) VALUES %s ON CONFLICT (name) DO NOTHING",
                       [(n,) for n in names])
    cur.execute("SELECT id, name FROM search_groups")
    gid = {n: i for i, n in cur.fetchall()}
    execute_values(
        cur,
        """UPDATE products p SET search_group_id = v.g, search_brand_id = v.b, model = v.m,
                  feature = v.f, parse_status = v.s
           FROM (VALUES %s) AS v(id, g, b, m, f, s)
           WHERE p.id = v.id AND p.parse_status <> 'manual'""",
        [(r['id'], gid.get(r['group']), brand_id, r['model'], r['feature'], r['status']) for r in results],
        template='(%s::int, %s::int, %s::int, %s::text, %s::text, %s::text)',
        page_size=500,
    )
    return resp(200, {'applied': len(results), 'counts': counts, 'groups_created': len(names)})

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
    'Access-Control-Max-Age': '86400',
}
HEADERS = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
STATUSES = {'none', 'parsed', 'doubtful', 'manual'}


def resp(status, body):
    return {'statusCode': status, 'headers': HEADERS, 'body': json.dumps(body, ensure_ascii=False, default=str)}


def is_owner(cur, event):
    h = event.get('headers') or {}
    token = (h.get('X-Authorization') or h.get('Authorization') or '').replace('Bearer ', '').strip()
    if not token:
        return False
    cur.execute(
        """SELECT u.role FROM users u JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,),
    )
    row = cur.fetchone()
    return bool(row and row[0] == 'owner')


def clean_aliases(raw, name):
    seen, out = set(), []
    for a in [name] + list(raw or []):
        a = (a or '').strip()
        if a and a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return out


def list_brands(cur):
    cur.execute(
        """SELECT b.id, b.name, b.aliases,
                  (SELECT count(*) FROM products p WHERE p.search_brand_id = b.id) AS cnt
           FROM search_brands b ORDER BY lower(b.name)"""
    )
    return [{'id': r[0], 'name': r[1], 'aliases': r[2] or [], 'products': r[3]} for r in cur.fetchall()]


def list_groups(cur):
    cur.execute(
        """SELECT g.id, g.name,
                  (SELECT count(*) FROM products p WHERE p.search_group_id = g.id) AS cnt
           FROM search_groups g ORDER BY lower(g.name)"""
    )
    return [{'id': r[0], 'name': r[1], 'products': r[2]} for r in cur.fetchall()]


def stats(cur):
    cur.execute(
        """SELECT parse_status, count(*) FROM products
           WHERE COALESCE(is_archived, false) = false GROUP BY parse_status"""
    )
    return {r[0]: r[1] for r in cur.fetchall()}


def save_dict(cur, section, body, item_id=None):
    name = (body.get('name') or '').strip()
    if not name:
        return resp(400, {'error': 'Укажите название'})
    table = 'search_brands' if section == 'brands' else 'search_groups'
    cur.execute(
        f"SELECT id FROM {table} WHERE lower(name) = lower(%s) AND id <> %s",
        (name, item_id or 0),
    )
    if cur.fetchone():
        return resp(409, {'error': 'Такое название уже есть'})
    if section == 'brands':
        aliases = clean_aliases(body.get('aliases'), name)
        if item_id:
            cur.execute("UPDATE search_brands SET name = %s, aliases = %s WHERE id = %s RETURNING id",
                        (name, aliases, item_id))
        else:
            cur.execute("INSERT INTO search_brands (name, aliases) VALUES (%s, %s) RETURNING id",
                        (name, aliases))
    else:
        if item_id:
            cur.execute("UPDATE search_groups SET name = %s WHERE id = %s RETURNING id", (name, item_id))
        else:
            cur.execute("INSERT INTO search_groups (name) VALUES (%s) RETURNING id", (name,))
    row = cur.fetchone()
    if not row:
        return resp(404, {'error': 'Запись не найдена'})
    return resp(200, {'id': row[0]})


def delete_dict(cur, section, item_id):
    table = 'search_brands' if section == 'brands' else 'search_groups'
    col = 'search_brand_id' if section == 'brands' else 'search_group_id'
    cur.execute(f"SELECT count(*) FROM products WHERE {col} = %s", (item_id,))
    used = cur.fetchone()[0]
    if used:
        return resp(409, {'error': f'Используется в {used} товарах — сначала уберите его из карточек'})
    cur.execute(f"DELETE FROM {table} WHERE id = %s", (item_id,))
    return resp(200, {'ok': True})


def int_or_none(v):
    if v in (None, '', 0, '0'):
        return None
    return int(v)


def save_product(cur, product_id, body):
    model = (body.get('model') or '').strip() or None
    feature = (body.get('feature') or '').strip() or None
    status = body.get('parse_status') or 'manual'
    if status not in STATUSES:
        return resp(400, {'error': 'Неизвестное состояние разбора'})
    cur.execute(
        """UPDATE products SET search_group_id = %s, search_brand_id = %s, model = %s,
                  feature = %s, parse_status = %s
           WHERE id = %s RETURNING id""",
        (int_or_none(body.get('search_group_id')), int_or_none(body.get('search_brand_id')),
         model, feature, status, product_id),
    )
    if not cur.fetchone():
        return resp(404, {'error': 'Товар не найден'})
    return resp(200, {'ok': True})


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')
    section = params.get('section', '')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    cur = conn.cursor()
    try:
        if not is_owner(cur, event):
            return resp(403, {'error': 'Доступно только владельцу'})

        if section == 'find':
            return resp(200, {'items': find_products(cur, params.get('q', ''), int_or_none(params.get('brand_id')))})

        if section == 'create':
            did = int_or_none(params.get('draft_id') or body.get('draft_id'))
            if not did:
                return resp(400, {'error': 'Не указан счёт'})
            if method == 'GET':
                res = creator.preview(cur, did)
                return resp(200, res) if res is not None else resp(404, {'error': 'Счёт не найден'})
            conn.autocommit = False
            if method == 'POST':
                res, err = creator.create(cur, did, body.get('items') or [])
            elif method == 'DELETE':
                res, err = creator.undo(cur, did, int_or_none(params.get('product_id')))
            else:
                return resp(400, {'error': 'Неверный запрос'})
            if err:
                conn.rollback()
                return resp(400, {'error': err})
            conn.commit()
            return resp(200, res)

        if section == 'prices':
            did = int_or_none(params.get('draft_id') or body.get('draft_id'))
            if not did:
                return resp(400, {'error': 'Не указан счёт'})
            if method == 'GET':
                res = prices.preview(cur, did)
                return resp(200, res) if res is not None else resp(404, {'error': 'Счёт не найден'})
            conn.autocommit = False
            if method == 'POST':
                res, err = prices.apply(cur, did, body.get('price_field'), body.get('price_mode'),
                                        body.get('items') or [])
            elif method == 'DELETE':
                res, err = prices.revert(cur, did)
            else:
                return resp(400, {'error': 'Неверный запрос'})
            if err:
                conn.rollback()
                return resp(400, {'error': err})
            conn.commit()
            return resp(200, res)

        if section == 'row_brand':
            did = int_or_none(body.get('draft_id'))
            bid = int_or_none(body.get('brand_id'))
            if not did or not bid:
                return resp(400, {'error': 'Укажите счёт и бренд'})
            cur.execute("SELECT rows_data, search_brand_id FROM invoice_drafts WHERE id = %s", (did,))
            d = cur.fetchone()
            if not d:
                return resp(404, {'error': 'Счёт не найден'})
            cur.execute("SELECT name, aliases FROM search_brands WHERE id = %s", (bid,))
            b = cur.fetchone()
            if not b:
                return resp(404, {'error': 'Бренд не найден'})
            word = (body.get('word') or '').strip()
            parsed_count = None
            if word:
                if len(word) < 2:
                    return resp(400, {'error': 'Слишком короткое слово'})
                cur.execute("SELECT name FROM search_brands WHERE id <> %s AND (lower(name) = lower(%s) "
                            "OR lower(%s) = ANY(SELECT lower(x) FROM unnest(aliases) x))", (bid, word, word))
                other = cur.fetchone()
                if other:
                    return resp(409, {'error': f'«{word}» уже записано у бренда {other[0]}'})
                aliases = clean_aliases(list(b[1] or []) + [word], b[0])
                cur.execute("UPDATE search_brands SET aliases = %s WHERE id = %s", (aliases, bid))
                pr = run_parse(cur, bid, apply=True)
                parsed_count = json.loads(pr['body']).get('applied')
            else:
                rows = d[0] or []
                for i in body.get('row_indexes') or []:
                    if 0 <= int(i) < len(rows):
                        rows[int(i)]['brand_override'] = bid
                cur.execute("UPDATE invoice_drafts SET rows_data = %s::jsonb WHERE id = %s",
                            (json.dumps(rows, ensure_ascii=False), did))
            res = match_draft(cur, did, d[1])
            res['parsed_count'] = parsed_count
            return resp(200, res)

        if section == 'match':
            did = int_or_none(params.get('draft_id') or body.get('draft_id'))
            if not did:
                return resp(400, {'error': 'Не указан счёт'})
            if method == 'GET':
                cur.execute(
                    "SELECT d.match_mode, d.search_brand_id, COALESCE(d.match_tolerance, s.match_tolerance, 0) "
                    "FROM invoice_drafts d LEFT JOIN invoice_suppliers s ON s.id = d.supplier_id WHERE d.id = %s",
                    (did,))
                r = cur.fetchone()
                if not r:
                    return resp(404, {'error': 'Счёт не найден'})
                return resp(200, {'mode': r[0], 'brand_id': r[1], 'tolerance': r[2]})
            tol = body.get('tolerance')
            res = match_draft(cur, did, int_or_none(body.get('brand_id')), None if tol is None else int(tol))
            if res is None:
                return resp(404, {'error': 'Счёт не найден'})
            return resp(200, res)

        if section == 'parse':
            bid = int_or_none(params.get('brand_id'))
            if not bid:
                return resp(400, {'error': 'Укажите бренд'})
            return run_parse(cur, bid, apply=(method == 'POST'))

        if method == 'GET':
            if section == 'brands':
                return resp(200, {'items': list_brands(cur)})
            if section == 'groups':
                return resp(200, {'items': list_groups(cur)})
            if section == 'stats':
                return resp(200, {'stats': stats(cur)})
            return resp(200, {'brands': list_brands(cur), 'groups': list_groups(cur), 'stats': stats(cur)})

        if section == 'product':
            pid = int_or_none(params.get('id'))
            if not pid or method != 'PUT':
                return resp(400, {'error': 'Укажите товар'})
            return save_product(cur, pid, body)

        if section not in ('brands', 'groups'):
            return resp(400, {'error': 'Неизвестный раздел'})

        item_id = int_or_none(params.get('id'))
        if method == 'POST':
            return save_dict(cur, section, body)
        if method == 'PUT' and item_id:
            return save_dict(cur, section, body, item_id)
        if method == 'DELETE' and item_id:
            return delete_dict(cur, section, item_id)
        return resp(400, {'error': 'Неверный запрос'})
    finally:
        cur.close()
        conn.close()