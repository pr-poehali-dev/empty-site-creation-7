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

MIN_LEN = 8
MAX_DIST = 3
MAX_CANDIDATES = 10
GTIN_LENGTHS = (8, 12, 13, 14)

FB = "btrim(COALESCE(factory_barcode,''))"
NAME_SQL = (
    "btrim(CASE WHEN btrim(COALESCE(product_group,''))='' THEN '' ELSE btrim(product_group) END || ' ' || "
    "CASE WHEN btrim(COALESCE(brand,''))='' THEN '' ELSE btrim(brand) END || ' ' || "
    "CASE WHEN btrim(COALESCE(model,''))='' THEN '' ELSE btrim(model) END)"
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


def who(cur, token):
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
        f"SELECT id, first_name, last_name FROM managers "
        f"WHERE phone='{_esc(u['phone'])}' LIMIT 1"
    )
    m = cur.fetchone()
    name = ''
    if m:
        name = ' '.join(x for x in [m['first_name'], m['last_name']] if x).strip()
    is_owner = u['role'] == 'owner'
    return {
        'is_owner': is_owner,
        'manager_id': m['id'] if m else None,
        'name': name or ('Владелец' if is_owner else 'Сотрудник'),
    }


def checksum_state(code):
    """'ok' / 'bad' — для кодов EAN/UPC/GTIN из 8, 12, 13, 14 цифр; 'na' — проверить нельзя."""
    if not code.isdigit() or len(code) not in GTIN_LENGTHS:
        return 'na'
    body, check = code[:-1], int(code[-1])
    total = 0
    for i, ch in enumerate(reversed(body)):
        total += int(ch) * (3 if i % 2 == 0 else 1)
    return 'ok' if (10 - total % 10) % 10 == check else 'bad'


def distance(a, b, limit=MAX_DIST):
    """Сколько цифр надо заменить, вставить или убрать, чтобы из a получить b.
    Больше limit не считаем — возвращаем limit + 1."""
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


def code_summary(cur, code):
    """Что стоит за заводским кодом: сколько единиц, как называется, заказ-наряды."""
    e = _esc(code)
    cur.execute(
        f"SELECT COUNT(*) AS units, MIN({NAME_SQL}) AS name, MIN(tech_name) AS tech_name, "
        f"(ARRAY_AGG(DISTINCT NULLIF(btrim(order_number),'')) "
        f"FILTER (WHERE NULLIF(btrim(order_number),'') IS NOT NULL))[1:3] AS orders "
        f"FROM receiving_items WHERE {FB}='{e}'"
    )
    r = cur.fetchone()
    return {
        'code': code,
        'units': int(r['units'] or 0),
        'name': (r['name'] or '').strip() or (r['tech_name'] or ''),
        'orders': r['orders'] or [],
        'checksum': checksum_state(code),
    }


def all_codes(cur):
    cur.execute(
        f"SELECT {FB} AS code, COUNT(*) AS units FROM receiving_items "
        f"WHERE {FB}<>'' GROUP BY 1"
    )
    return {r['code']: int(r['units']) for r in cur.fetchall()}


def act_similar(cur, params):
    """Код не нашёлся — ищем заводские коды, отличающиеся на 1–3 цифры."""
    code = (params.get('code') or '').strip()
    if not code:
        return None, 'Не указан код'
    codes = all_codes(cur)
    out = {
        'code': code,
        'exists': code in codes,
        'checksum': checksum_state(code),
        'too_short': len(code) < MIN_LEN,
        'candidates': [],
    }
    if out['too_short']:
        return out, None
    found = []
    for other in codes:
        if other == code:
            continue
        d = distance(code, other)
        if d <= MAX_DIST:
            found.append((d, -codes[other], other))
    found.sort()
    for d, _, other in found[:MAX_CANDIDATES]:
        s = code_summary(cur, other)
        s['distance'] = d
        out['candidates'].append(s)
    return out, None


def act_by_supplier(cur, params):
    """Этикетка поставщика точно определяет единицу — а с ней и заводской код её модели."""
    code = (params.get('code') or '').strip()
    if not code:
        return None, 'Не указан код'
    e = _esc(code)
    cur.execute(
        f"SELECT id, {NAME_SQL} AS name, tech_name, order_number, product_group, brand, model, "
        f"{FB} AS factory_barcode FROM receiving_items "
        f"WHERE btrim(supplier_barcode)='{e}' LIMIT 1"
    )
    r = cur.fetchone()
    if not r:
        return {'found': False, 'code': code}, None
    item = dict(r)
    item['name'] = (item['name'] or '').strip() or (item['tech_name'] or '')
    summary = code_summary(cur, item['factory_barcode']) if item['factory_barcode'] else None
    return {'found': True, 'item': item, 'factory': summary}, None


def act_replace(cur, actor, body):
    """Заменить ошибочный заводской код у всех единиц, где он записан. Пишем в журнал."""
    old = (body.get('old_code') or '').strip()
    new = (body.get('new_code') or '').strip()
    source = (body.get('source') or 'similar').strip()[:20]
    if not old or not new:
        return None, 'Не указан старый или новый код'
    if old == new:
        return None, 'Коды совпадают — менять нечего'
    cur.execute(
        f"UPDATE receiving_items SET factory_barcode='{_esc(new)}' "
        f"WHERE {FB}='{_esc(old)}' RETURNING id"
    )
    ids = [r['id'] for r in cur.fetchall()]
    if not ids:
        return None, 'Код уже исправлен или не найден'
    mid = int(actor['manager_id']) if actor['manager_id'] else 'NULL'
    cur.execute(
        f"INSERT INTO barcode_fixes (old_code, new_code, units, item_ids, source, fixed_by, fixed_by_name) "
        f"VALUES ('{_esc(old)}', '{_esc(new)}', {len(ids)}, '{json.dumps(ids)}'::jsonb, "
        f"'{_esc(source)}', {mid}, '{_esc(actor['name'])}') RETURNING id"
    )
    fix_id = cur.fetchone()['id']
    return {'ok': True, 'fix_id': fix_id, 'updated': len(ids)}, None


def act_revert(cur, actor, body):
    """Откат замены — только владелец. Возвращаем старый код тем же единицам,
    если их код с тех пор никто не менял."""
    if not actor['is_owner']:
        return None, 'Откатывать замену может только владелец'
    fid = int(body.get('id') or 0)
    cur.execute(f"SELECT * FROM barcode_fixes WHERE id={fid} LIMIT 1")
    fix = cur.fetchone()
    if not fix:
        return None, 'Запись не найдена'
    if fix['reverted_at']:
        return None, 'Уже откатили'
    ids = [int(x) for x in (fix['item_ids'] or [])]
    restored = 0
    if ids:
        joined = ','.join(str(i) for i in ids)
        cur.execute(
            f"UPDATE receiving_items SET factory_barcode='{_esc(fix['old_code'])}' "
            f"WHERE id IN ({joined}) AND {FB}='{_esc(fix['new_code'])}' RETURNING id"
        )
        restored = len(cur.fetchall())
    cur.execute(
        f"UPDATE barcode_fixes SET reverted_at=now(), reverted_by_name='{_esc(actor['name'])}' "
        f"WHERE id={fid}"
    )
    return {'ok': True, 'restored': restored}, None


def act_log(cur, actor, params):
    """Журнал замен для владельца: отбор по датам и сотруднику."""
    if not actor['is_owner']:
        return None, 'Журнал замен видит только владелец'
    where = ['true']
    d_from = (params.get('from') or '').strip()
    d_to = (params.get('to') or '').strip()
    who_q = (params.get('who') or '').strip()
    if len(d_from) == 10:
        where.append(f"fixed_at >= '{_esc(d_from)}'::date")
    if len(d_to) == 10:
        where.append(f"fixed_at < '{_esc(d_to)}'::date + 1")
    if who_q:
        where.append(f"fixed_by_name ILIKE '%{_esc(who_q)}%'")
    cur.execute(
        f"SELECT id, old_code, new_code, units, source, fixed_by_name, fixed_at, "
        f"reverted_at, reverted_by_name FROM barcode_fixes "
        f"WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT 200"
    )
    return {'rows': [dict(r) for r in cur.fetchall()]}, None


def act_suspicious(cur, actor):
    """Коды, в которых точно ошибка (не сходится контрольное число),
    и коды нестандартной длины, которые проверить нельзя."""
    if not actor['is_owner']:
        return None, 'Контроль штрихкодов видит только владелец'
    codes = all_codes(cur)
    bad, odd = [], []
    for code in codes:
        state = checksum_state(code)
        if state == 'bad':
            bad.append(code)
        elif state == 'na':
            odd.append(code)
    return {
        'bad': [code_summary(cur, c) for c in sorted(bad)],
        'unchecked': [code_summary(cur, c) for c in sorted(odd)],
        'total_codes': len(codes),
    }, None


def handler(event: dict, context) -> dict:
    """Исправление ошибочных заводских штрихкодов: поиск похожих кодов (1–3 цифры), определение товара по этикетке поставщика, замена кода у всех единиц с записью в журнал, откат замены владельцем, список кодов с неверным контрольным числом."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'barcode-fix'})

    body = {}
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        action = body.get('action', action)

    with psycopg2.connect(os.environ['DATABASE_URL']) as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
        if not actor:
            return _resp(401, {'error': 'Войдите заново'})

        handlers = {
            'similar': lambda: act_similar(cur, params),
            'by_supplier': lambda: act_by_supplier(cur, params),
            'replace': lambda: act_replace(cur, actor, body),
            'revert': lambda: act_revert(cur, actor, body),
            'log': lambda: act_log(cur, actor, params),
            'suspicious': lambda: act_suspicious(cur, actor),
        }
        if action in handlers:
            data, err = handlers[action]()
            if err:
                status = 403 if 'только владелец' in err else 400
                return _resp(status, {'error': err})
            return _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})
