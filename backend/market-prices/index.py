import json
import os
import re

import psycopg2
from psycopg2.extras import RealDictCursor

from sources import SITES, Blocked, clean_model, search

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}

TOTALS = {'total_ru': ['wb_ru', 'mv_ru'], 'total_by': ['wb_by']}

COLS = (
    'brand_key, model_key, brand, model, '
    + ', '.join(f'{s}, {s}_status, {s}_at, {s}_title' for s in SITES)
    + ', total_ru, total_ru_manual, total_by, total_by_manual, updated_at'
)


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json', **CORS},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _esc(s):
    return str(s).replace("'", "''")


def _lit(v):
    return 'NULL' if v is None else f"'{_esc(v)}'"


def keys(brand, model):
    b = re.sub(r'\s+', ' ', (brand or '').strip().lower())
    m = re.sub(r'\s+', ' ', clean_model(brand, model).lower())
    return b, m


def who(cur, token):
    token = (token or '').replace('Bearer ', '').strip()
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role, u.phone FROM users u JOIN user_sessions s ON s.user_id=u.id "
        f"WHERE s.token='{_esc(token)}' AND s.expires_at > NOW() LIMIT 1"
    )
    u = cur.fetchone()
    if not u:
        return None
    cur.execute(f"SELECT id, role_id FROM managers WHERE phone='{_esc(u['phone'])}' LIMIT 1")
    m = cur.fetchone() or {}
    return {'is_owner': u['role'] == 'owner', 'manager_id': m.get('id'), 'role_id': m.get('role_id')}


def perms_of(cur, actor):
    result = {}
    for col, val in (('role_id', actor['role_id']), ('manager_id', actor['manager_id'])):
        if val:
            cur.execute(
                f"SELECT perm_key, enabled FROM receiving_permissions WHERE {col}={int(val)}"
            )
            for r in cur.fetchall():
                result[r['perm_key']] = r['enabled']
    return result


def get_row(cur, b, m):
    cur.execute(
        f"SELECT {COLS} FROM model_market_prices WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
    )
    return cur.fetchone()


def ensure_row(cur, brand, model):
    b, m = keys(brand, model)
    cur.execute(
        f"INSERT INTO model_market_prices (brand_key, model_key, brand, model) "
        f"VALUES ({_lit(b)}, {_lit(m)}, {_lit(brand)}, {_lit(clean_model(brand, model))}) "
        f"ON CONFLICT (brand_key, model_key) DO NOTHING"
    )
    return b, m


def recalc(cur, b, m):
    """Итог страны всегда пересчитывается в среднюю найденных цен этой страны."""
    row = get_row(cur, b, m)
    sets = []
    for total, sites in TOTALS.items():
        vals = [float(row[s]) for s in sites if row[s] is not None]
        if vals:
            sets.append(f"{total}={round(sum(vals) / len(vals), 2)}, {total}_manual=FALSE")
    if sets:
        cur.execute(
            f"UPDATE model_market_prices SET {', '.join(sets)}, updated_at=NOW() "
            f"WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
        )


def fetch_price(cur, body):
    site = body.get('site')
    brand, model = body.get('brand') or '', body.get('model') or ''
    if site not in SITES or not clean_model(brand, model):
        return None, 'Нужны сайт, бренд и модель'
    b, m = ensure_row(cur, brand, model)
    price, title, status = None, None, 'ok'
    try:
        found = search(site, brand, model)
        if found:
            title, price = found
        else:
            status = 'not_found'
    except Blocked:
        status = 'blocked'
    except Exception as e:
        print(f'{site} {brand} {model}: {e}')
        status = 'error'
    if status == 'ok' or status == 'not_found':
        cur.execute(
            f"UPDATE model_market_prices SET {site}={_lit(price)}, {site}_status='{status}', "
            f"{site}_at=NOW(), {site}_title={_lit(title)}, updated_at=NOW() "
            f"WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
        )
    else:
        cur.execute(
            f"UPDATE model_market_prices SET {site}_status='{status}', {site}_at=NOW(), "
            f"updated_at=NOW() WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
        )
    recalc(cur, b, m)
    return {'row': get_row(cur, b, m), 'status': status}, None


def set_total(cur, body):
    field = body.get('field')
    if field not in TOTALS:
        return None, 'Неизвестное поле'
    raw = str(body.get('value') if body.get('value') is not None else '').replace(' ', '').replace(',', '.')
    value = None
    if raw:
        try:
            value = round(float(raw), 2)
        except ValueError:
            return None, 'Введите число'
    b, m = ensure_row(cur, body.get('brand') or '', body.get('model') or '')
    cur.execute(
        f"UPDATE model_market_prices SET {field}={_lit(value)}, {field}_manual={'TRUE' if value is not None else 'FALSE'}, "
        f"updated_at=NOW() WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
    )
    return {'row': get_row(cur, b, m)}, None


def lookup(cur, body):
    pairs = {keys(p.get('brand'), p.get('model')) for p in (body.get('models') or [])[:500]}
    pairs = [p for p in pairs if p[1]]
    if not pairs:
        return {'rows': []}
    vals = ', '.join(f"({_lit(b)}, {_lit(m)})" for b, m in pairs)
    cur.execute(f"SELECT {COLS} FROM model_market_prices WHERE (brand_key, model_key) IN ({vals})")
    return {'rows': cur.fetchall()}


def handler(event: dict, context) -> dict:
    """Цены маркетплейсов по модели: поиск минимальной цены на Wildberries РФ/РБ и М.Видео, средняя по стране, ручной ввод. Цена общая для всех товаров одной модели."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}
    if method == 'GET':
        return _resp(200, {'status': 'ok', 'service': 'market-prices', 'sites': SITES})

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    body = json.loads(event.get('body') or '{}')
    action = body.get('action', '')

    with psycopg2.connect(os.environ['DATABASE_URL']) as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
        if not actor:
            return _resp(401, {'error': 'Войдите заново'})
        perms = perms_of(cur, actor)
        can_see = actor['is_owner'] or perms.get('market_see') or perms.get('market_edit')
        can_edit = actor['is_owner'] or perms.get('market_edit')
        if not can_see:
            return _resp(403, {'error': 'Нет доступа к ценам маркетплейсов'})

        if action == 'lookup':
            return _resp(200, {**lookup(cur, body), 'can_edit': bool(can_edit)})
        if action in ('fetch', 'set_total') and not can_edit:
            return _resp(403, {'error': 'Нет права получать и править цены'})
        if action == 'fetch':
            data, err = fetch_price(cur, body)
            return _resp(400, {'error': err}) if err else _resp(200, data)
        if action == 'set_total':
            data, err = set_total(cur, body)
            return _resp(400, {'error': err}) if err else _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})
