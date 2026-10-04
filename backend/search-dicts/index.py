"""Справочники для поиска (бренды, товарные группы) и поля разбора товара. Только для владельца."""
import json
import os
import psycopg2

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
