import json
import os

import psycopg2
from psycopg2.extras import RealDictCursor

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}

TEXT_FIELDS = [
    'supplier_barcode', 'tech_name', 'serial_number', 'declared_defect',
    'brand', 'model', 'product_group', 'direction', 'order_number',
    'supplier_code', 'new_defect_text', 'check_result', 'warehouse',
    'factory_barcode', 'factory_barcode_2',
]
NUM_FIELDS = ['weight_gross', 'weight_net', 'volume', 'price', 'invoice_weight']
BOOL_FIELDS = ['has_package', 'defect_confirmed', 'new_defect']
READONLY_FIELDS = ['checked_by_name', 'checked_at']

ALL_FIELDS = TEXT_FIELDS + NUM_FIELDS + BOOL_FIELDS + READONLY_FIELDS

GROUP_FIELDS = {'product_group', 'brand', 'model', 'direction', 'price'}

G = "COALESCE(NULLIF(btrim(product_group),''),'')"
B = "COALESCE(NULLIF(btrim(brand),''),'')"
M = "COALESCE(NULLIF(btrim(model),''),'')"

NAME_SQL = (
    f"btrim(CASE WHEN {G}='' THEN 'без группы' ELSE {G} END || ' ' || "
    f"CASE WHEN {B}='' THEN 'без бренда' ELSE {B} END || ' ' || "
    f"CASE WHEN {M}='' THEN 'без модели' ELSE {M} END)"
)


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json', **CORS},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def _esc(s):
    return str(s).replace("'", "''")


def who(cur, token):
    """Опознаёт человека по токену входа: токен ищется в таблице сессий."""
    token = (token or '').replace('Bearer ', '').strip()
    if not token:
        return None
    cur.execute(
        f"SELECT u.role, u.phone FROM users u JOIN user_sessions s ON s.user_id=u.id "
        f"WHERE s.token='{_esc(token)}' AND s.expires_at > NOW() LIMIT 1"
    )
    u = cur.fetchone()
    if not u:
        return None
    cur.execute(
        f"SELECT m.id, m.role_id FROM managers m WHERE m.phone='{_esc(u['phone'])}' LIMIT 1"
    )
    m = cur.fetchone()
    return {
        'is_owner': u['role'] == 'owner',
        'manager_id': m['id'] if m else None,
        'role_id': m['role_id'] if m else None,
    }


def perms_of(cur, actor):
    """Итоговые права: роль плюс личные переопределения."""
    result = {}
    if actor['role_id']:
        cur.execute(
            f"SELECT perm_key, enabled FROM receiving_permissions WHERE role_id={int(actor['role_id'])}"
        )
        for r in cur.fetchall():
            result[r['perm_key']] = r['enabled']
    if actor['manager_id']:
        cur.execute(
            f"SELECT perm_key, enabled FROM receiving_permissions WHERE manager_id={int(actor['manager_id'])}"
        )
        for r in cur.fetchall():
            result[r['perm_key']] = r['enabled']
    return result


def visible_fields(actor, perms):
    if actor['is_owner']:
        return list(ALL_FIELDS)
    return [f for f in ALL_FIELDS if perms.get(f'cat_see_{f}')]


def editable_fields(actor, perms):
    if actor['is_owner']:
        return [f for f in ALL_FIELDS if f not in READONLY_FIELDS]
    return [f for f in ALL_FIELDS if f not in READONLY_FIELDS and perms.get(f'cat_edit_{f}')]


def _where(params, extra=''):
    parts = ["1=1"]
    q = (params.get('q') or '').strip()
    direction = (params.get('direction') or '').strip()
    brand = (params.get('brand') or '').strip()
    if direction:
        parts.append(f"COALESCE(direction,'')='{_esc(direction)}'")
    if brand:
        parts.append(f"COALESCE(brand,'')='{_esc(brand)}'")
    if q:
        e = _esc(q)
        if extra == 'tech':
            parts.append(
                f"(tech_name ILIKE '%{e}%' OR brand ILIKE '%{e}%' OR model ILIKE '%{e}%' "
                f"OR supplier_barcode ILIKE '%{e}%' OR order_number ILIKE '%{e}%' "
                f"OR serial_number ILIKE '%{e}%')"
            )
        else:
            parts.append(
                f"({NAME_SQL} ILIKE '%{e}%' OR brand ILIKE '%{e}%' OR model ILIKE '%{e}%' "
                f"OR product_group ILIKE '%{e}%')"
            )
    return ' AND '.join(parts)


def list_groups(cur, params, see_price):
    limit = min(int(params.get('limit') or 50), 200)
    offset = max(int(params.get('offset') or 0), 0)
    where = _where(params)
    price_cols = "MIN(price) AS price_min, MAX(price) AS price_max," if see_price else ""
    cur.execute(
        f"SELECT {NAME_SQL} AS name, {G} AS product_group, {B} AS brand, {M} AS model, "
        f"MAX(direction) AS direction, {price_cols} COUNT(*) AS qty, "
        f"MIN(NULLIF(btrim(factory_barcode),'')) AS factory_barcode, "
        f"COUNT(DISTINCT NULLIF(btrim(factory_barcode),'')) AS factory_variants "
        f"FROM receiving_items WHERE {where} "
        f"GROUP BY 1,2,3,4 ORDER BY 1 LIMIT {limit} OFFSET {offset}"
    )
    rows = [dict(r) for r in cur.fetchall()]
    return rows


def count_groups(cur, params):
    where = _where(params)
    cur.execute(
        f"SELECT COUNT(*) AS n FROM (SELECT 1 FROM receiving_items WHERE {where} "
        f"GROUP BY {G},{B},{M}) t"
    )
    return int(cur.fetchone()['n'])


def list_items(cur, params, fields):
    limit = min(int(params.get('limit') or 50), 200)
    offset = max(int(params.get('offset') or 0), 0)
    where = _where(params, 'tech')
    cols = ','.join(['id'] + fields) if fields else 'id'
    cur.execute(
        f"SELECT {cols} FROM receiving_items WHERE {where} ORDER BY id LIMIT {limit} OFFSET {offset}"
    )
    return [dict(r) for r in cur.fetchall()]


def count_items(cur, params):
    where = _where(params, 'tech')
    cur.execute(f"SELECT COUNT(*) AS n FROM receiving_items WHERE {where}")
    return int(cur.fetchone()['n'])


def group_where(body):
    g = _esc((body.get('product_group') or '').strip())
    b = _esc((body.get('brand') or '').strip())
    m = _esc((body.get('model') or '').strip())
    return f"{G}='{g}' AND {B}='{b}' AND {M}='{m}'"


def group_items(cur, body, fields):
    limit = min(int(body.get('limit') or 100), 500)
    offset = max(int(body.get('offset') or 0), 0)
    cols = ','.join(['id'] + fields) if fields else 'id'
    where = group_where(body)
    cur.execute(f"SELECT COUNT(*) AS n FROM receiving_items WHERE {where}")
    total = int(cur.fetchone()['n'])
    cur.execute(
        f"SELECT {cols} FROM receiving_items WHERE {where} ORDER BY id LIMIT {limit} OFFSET {offset}"
    )
    return [dict(r) for r in cur.fetchall()], total


def _sql_value(field, value):
    if value is None or value == '':
        return 'NULL'
    if field in NUM_FIELDS:
        return str(float(value))
    if field in BOOL_FIELDS:
        return 'true' if value in (True, 'true', 1, '1') else 'false'
    return "'" + _esc(value) + "'"


def update_item(cur, body, editable):
    item_id = int(body.get('id') or 0)
    field = body.get('field') or ''
    if field not in editable:
        return None, 'Нет права на правку этого поля'
    if not item_id:
        return None, 'Не указана строка'
    cur.execute(
        f"UPDATE receiving_items SET {field}={_sql_value(field, body.get('value'))} WHERE id={item_id}"
    )
    return {'ok': True, 'updated': cur.rowcount}, None


def update_group(cur, body, editable):
    field = body.get('field') or ''
    if field not in editable:
        return None, 'Нет права на правку этого поля'
    if field not in GROUP_FIELDS:
        return None, 'Это поле правится только у отдельной единицы'
    where = group_where(body)
    cur.execute(
        f"UPDATE receiving_items SET {field}={_sql_value(field, body.get('value'))} WHERE {where}"
    )
    return {'ok': True, 'updated': cur.rowcount}, None


def filters(cur):
    cur.execute(
        "SELECT DISTINCT direction FROM receiving_items "
        "WHERE direction IS NOT NULL AND btrim(direction)<>'' ORDER BY 1"
    )
    directions = [r['direction'] for r in cur.fetchall()]
    cur.execute(
        "SELECT DISTINCT brand FROM receiving_items "
        "WHERE brand IS NOT NULL AND btrim(brand)<>'' ORDER BY 1"
    )
    brands = [r['brand'] for r in cur.fetchall()]
    return {'directions': directions, 'brands': brands}


def handler(event: dict, context) -> dict:
    """Каталог приёмки: список по красивым наименованиям и по техническим строкам, карточка позиции, правка полей с проверкой прав."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'receiving-catalog'})

    body = {}
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        action = body.get('action', action)

    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
        if not actor:
            return _resp(401, {'error': 'Войдите заново'})
        perms = perms_of(cur, actor)
        if not actor['is_owner'] and not perms.get('catalog_edit'):
            return _resp(403, {'error': 'Нет доступа к каталогу приёмки'})

        fields = visible_fields(actor, perms)
        editable = editable_fields(actor, perms)
        see_price = 'price' in fields

        if action == 'meta':
            return _resp(200, {
                'visible': fields,
                'editable': editable,
                'modes': {
                    'beauty': bool(actor['is_owner'] or perms.get('name_beauty')),
                    'tech': bool(actor['is_owner'] or perms.get('name_tech')),
                },
                **filters(cur),
            })

        if action == 'groups':
            return _resp(200, {
                'rows': list_groups(cur, params, see_price),
                'total': count_groups(cur, params),
                'see_price': see_price,
            })

        if action == 'items':
            return _resp(200, {
                'rows': list_items(cur, params, fields),
                'total': count_items(cur, params),
                'fields': fields,
            })

        if action == 'group_items':
            rows, total = group_items(cur, body, fields)
            return _resp(200, {'rows': rows, 'total': total, 'fields': fields})

        if action == 'update_item':
            data, err = update_item(cur, body, editable)
            return _resp(403, {'error': err}) if err else _resp(200, data)

        if action == 'update_group':
            data, err = update_group(cur, body, editable)
            return _resp(403, {'error': err}) if err else _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})