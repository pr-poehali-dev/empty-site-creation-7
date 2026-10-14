import json
import os

import psycopg2
from psycopg2.extras import RealDictCursor

import positions as P

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
    """Что стоит за заводским кодом: сколько единиц, как называется, заказ-наряды.
    Код ищется и у единиц, и в кодах позиций — у позиции их может быть несколько."""
    cur.execute(
        f"SELECT COUNT(*) AS units, MIN({NAME_SQL}) AS name, MIN(tech_name) AS tech_name, "
        f"(ARRAY_AGG(DISTINCT NULLIF(btrim(order_number),'')) "
        f"FILTER (WHERE NULLIF(btrim(order_number),'') IS NOT NULL))[1:3] AS orders "
        f"FROM receiving_items WHERE {P.code_match(code)}"
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
    """Все известные заводские коды с числом единиц: записанные у единиц и коды позиций."""
    cur.execute(
        f"SELECT {FB} AS code, COUNT(*) AS units FROM receiving_items "
        f"WHERE {FB}<>'' GROUP BY 1"
    )
    codes = {r['code']: int(r['units']) for r in cur.fetchall()}
    cur.execute(
        f"SELECT pc.code, COUNT(i.id) AS units FROM position_codes pc "
        f"LEFT JOIN receiving_items i ON btrim(COALESCE(i.product_group,''))=pc.product_group "
        f"AND btrim(COALESCE(i.brand,''))=pc.brand AND btrim(COALESCE(i.model,''))=pc.model "
        f"GROUP BY pc.code"
    )
    for r in cur.fetchall():
        if r['code'] not in codes:
            codes[r['code']] = int(r['units'])
    return codes


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


def _item_card(cur, where):
    cur.execute(
        f"SELECT id, {NAME_SQL} AS name, tech_name, order_number, supplier_barcode, "
        f"{P.PG} AS product_group, {P.PB} AS brand, {P.PM} AS model, warehouse, "
        f"{FB} AS factory_barcode FROM receiving_items WHERE {where} LIMIT 1"
    )
    r = cur.fetchone()
    if not r:
        return None
    item = dict(r)
    item['name'] = (item['name'] or '').strip() or (item['tech_name'] or '')
    pos = P.norm_pos(item)
    item['codes'] = P.pos_codes(cur, pos)
    item['units'] = P.pos_units(cur, pos)
    return item


def act_by_supplier(cur, params):
    """Этикетка поставщика (или заказ-наряд) точно определяет единицу —
    а с ней позицию и все её заводские коды."""
    code = (params.get('code') or '').strip()
    if not code:
        return None, 'Не указан код'
    e = _esc(code)
    by = (params.get('by') or 'supplier').strip()
    if by == 'order':
        item = _item_card(cur, f"btrim(COALESCE(order_number,''))='{e}'")
    else:
        item = _item_card(cur, f"btrim(COALESCE(supplier_barcode,''))='{e}'")
        if not item and by == 'any':
            item = _item_card(cur, f"btrim(COALESCE(order_number,''))='{e}'")
    if not item:
        return {'found': False, 'code': code}, None
    main = item['factory_barcode'] or (item['codes'][0] if item['codes'] else '')
    summary = code_summary(cur, main) if main else None
    return {'found': True, 'item': item, 'factory': summary}, None


def act_positions(cur, params):
    """Выбор товара из списка: позиции по словам в группе, бренде, модели."""
    q = (params.get('q') or '').strip()
    words = [w for w in q.split() if len(w) >= 1][:5]
    if not words or len(q) < 2:
        return {'rows': []}, None
    parts = []
    for w in words:
        e = _esc(w)
        parts.append(
            f"({P.PG} ILIKE '%{e}%' OR {P.PB} ILIKE '%{e}%' OR {P.PM} ILIKE '%{e}%')"
        )
    cur.execute(
        f"SELECT {P.PG} AS product_group, {P.PB} AS brand, {P.PM} AS model, COUNT(*) AS units "
        f"FROM receiving_items WHERE {' AND '.join(parts)} "
        f"GROUP BY 1,2,3 ORDER BY units DESC, 1,2,3 LIMIT 30"
    )
    rows = []
    for r in cur.fetchall():
        p = P.norm_pos(r)
        p['units'] = int(r['units'])
        p['name'] = P.pos_name(p)
        p['codes'] = P.pos_codes(cur, p)
        rows.append(p)
    return {'rows': rows}, None


def act_code_info(cur, params):
    """За какими позициями сейчас числится код — чтобы перенести его, если выплыл не тот товар."""
    code = (params.get('code') or '').strip()
    if not code:
        return None, 'Не указан код'
    rows = P.positions_of_code(cur, code)
    for p in rows:
        p['codes'] = P.pos_codes(cur, p)
    return {'code': code, 'positions': rows, 'checksum': checksum_state(code)}, None


def _log_fix(cur, actor, old, new, item_ids, source, units, from_pos=None, to_pos=None, cleared=None):
    mid = int(actor['manager_id']) if actor['manager_id'] else 'NULL'
    fp = f"'{_esc(json.dumps(from_pos, ensure_ascii=False))}'::jsonb" if from_pos is not None else 'NULL'
    tp = f"'{_esc(json.dumps(to_pos, ensure_ascii=False))}'::jsonb" if to_pos is not None else 'NULL'
    cl = f"'{_esc(json.dumps(cleared))}'::jsonb" if cleared is not None else 'NULL'
    cur.execute(
        f"INSERT INTO barcode_fixes (old_code, new_code, units, item_ids, source, fixed_by, "
        f"fixed_by_name, from_pos, to_pos, cleared_ids) "
        f"VALUES ('{_esc(old)}', '{_esc(new)}', {int(units)}, '{json.dumps(item_ids)}'::jsonb, "
        f"'{_esc(source)}', {mid}, '{_esc(actor['name'])}', {fp}, {tp}, {cl}) RETURNING id"
    )
    return cur.fetchone()['id']


def act_assign(cur, actor, body):
    """Присвоить заводской код позиции. Код добавляется к уже имеющимся кодам позиции.
    Если код числится за другими позициями и передан move_from — переносим его оттуда."""
    code = (body.get('code') or '').strip()
    pos = P.norm_pos(body.get('position'))
    if not code:
        return None, 'Не указан код'
    if len(code) > 64:
        return None, 'Слишком длинный код'
    if P.pos_empty(pos):
        return None, 'Не выбран товар'
    if P.pos_units(cur, pos) == 0:
        return None, 'Такой товар не найден'

    move_from = [P.norm_pos(x) for x in (body.get('move_from') or []) if isinstance(x, dict)]
    move_from = [p for p in move_from if not P.pos_empty(p) and p != pos]

    cleared = {}
    moved_from = []
    for src in move_from:
        res = P.transfer_out(cur, code, src)
        cleared.update(res)
        moved_from.append(src)

    added = P.ensure_code(cur, code, pos, 'transfer' if moved_from else 'assign', actor['name'])
    filled = P.fill_items(cur, code, pos)
    if not added and not filled and not moved_from:
        return {'ok': True, 'already': True, 'updated': 0}, None

    to_pos = dict(pos)
    to_pos['added'] = added
    fix_id = _log_fix(
        cur, actor, code if moved_from else '', code, filled,
        'transfer' if moved_from else 'assign',
        P.pos_units(cur, pos), moved_from, [to_pos], cleared,
    )
    return {
        'ok': True,
        'fix_id': fix_id,
        'updated': P.pos_units(cur, pos),
        'filled': len(filled),
        'moved_from': len(moved_from),
    }, None


def act_replace(cur, actor, body):
    """Заменить ошибочный заводской код: у единиц и в кодах позиций. Пишем в журнал."""
    old = (body.get('old_code') or '').strip()
    new = (body.get('new_code') or '').strip()
    source = (body.get('source') or 'similar').strip()[:20]
    if not old or not new:
        return None, 'Не указан старый или новый код'
    if old == new:
        return None, 'Коды совпадают — менять нечего'

    cur.execute(
        f"SELECT product_group, brand, model FROM position_codes WHERE code='{_esc(old)}'"
    )
    pos_list = [P.norm_pos(r) for r in cur.fetchall()]
    to_pos = []
    for p in pos_list:
        P.drop_code(cur, old, p)
        q = dict(p)
        q['added'] = P.ensure_code(cur, new, p, source, actor['name'])
        to_pos.append(q)

    cur.execute(
        f"UPDATE receiving_items SET factory_barcode='{_esc(new)}' "
        f"WHERE {FB}='{_esc(old)}' RETURNING id"
    )
    ids = [r['id'] for r in cur.fetchall()]
    if not ids and not pos_list:
        return None, 'Код уже исправлен или не найден'
    units = len(ids)
    if not units:
        units = sum(P.pos_units(cur, p) for p in pos_list)
    fix_id = _log_fix(cur, actor, old, new, ids, source, units, pos_list, to_pos)
    return {'ok': True, 'fix_id': fix_id, 'updated': units}, None


def act_revert(cur, actor, body):
    """Откат — только владелец. Возвращаем всё ровно тем единицам и позициям,
    которых касалось действие, если их код с тех пор никто не менял."""
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
    from_pos = fix.get('from_pos') or []
    to_pos = fix.get('to_pos') or []
    cleared = fix.get('cleared_ids') or {}
    old, new = fix['old_code'], fix['new_code']
    source = fix['source']
    restored = 0

    if source in ('assign', 'transfer'):
        for p in to_pos:
            if p.get('added'):
                P.drop_code(cur, new, P.norm_pos(p))
        if ids:
            joined = ','.join(str(i) for i in ids)
            cur.execute(
                f"UPDATE receiving_items SET factory_barcode=NULL "
                f"WHERE id IN ({joined}) AND {FB}='{_esc(new)}' RETURNING id"
            )
            restored += len(cur.fetchall())
        for p in from_pos:
            P.ensure_code(cur, new, P.norm_pos(p), 'revert', actor['name'])
        for sid, put in cleared.items():
            if not str(sid).isdigit():
                continue
            cond = f"{FB}='{_esc(put)}'" if put else f"{FB}=''"
            cur.execute(
                f"UPDATE receiving_items SET factory_barcode='{_esc(new)}' "
                f"WHERE id={int(sid)} AND {cond} RETURNING id"
            )
            restored += len(cur.fetchall())
    else:
        if ids:
            joined = ','.join(str(i) for i in ids)
            cur.execute(
                f"UPDATE receiving_items SET factory_barcode='{_esc(old)}' "
                f"WHERE id IN ({joined}) AND {FB}='{_esc(new)}' RETURNING id"
            )
            restored = len(cur.fetchall())
        for p in to_pos:
            if p.get('added'):
                P.drop_code(cur, new, P.norm_pos(p))
        for p in from_pos:
            P.ensure_code(cur, old, P.norm_pos(p), 'revert', actor['name'])

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
        f"reverted_at, reverted_by_name, from_pos, to_pos FROM barcode_fixes "
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
    """Заводские штрихкоды приёмки: поиск похожих кодов (1–3 цифры), определение товара по этикетке поставщика или заказ-наряду, выбор товара из списка, присвоение кода позиции (у позиции может быть несколько кодов), перенос ошибочно присвоенного кода на другой товар, замена с журналом, откат владельцем, список кодов с неверным контрольным числом."""
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
            'positions': lambda: act_positions(cur, params),
            'code_info': lambda: act_code_info(cur, params),
            'assign': lambda: act_assign(cur, actor, body),
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