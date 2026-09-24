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

WAREHOUSES = [
    {'key': 'wh_sgp', 'name': 'СГП'},
    {'key': 'wh_wipe', 'name': 'Протирка'},
    {'key': 'wh_repair', 'name': 'Под ремонт'},
    {'key': 'wh_scrap', 'name': 'Утиль'},
]

NAME_BY_KEY = {w['key']: w['name'] for w in WAREHOUSES}
KEY_BY_NAME = {w['name']: w['key'] for w in WAREHOUSES}

ITEM_COLS = (
    'id, supplier_barcode, tech_name, serial_number, declared_defect, brand, model, '
    'factory_barcode, check_result, warehouse, checked_at, checked_by_name'
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
        f"SELECT id, role_id, first_name, last_name FROM managers "
        f"WHERE phone='{_esc(u['phone'])}' LIMIT 1"
    )
    m = cur.fetchone()
    name = ''
    if m:
        name = ' '.join(x for x in [m['first_name'], m['last_name']] if x).strip()
    return {
        'is_owner': u['role'] == 'owner',
        'manager_id': m['id'] if m else None,
        'role_id': m['role_id'] if m else None,
        'name': name or ('Владелец' if u['role'] == 'owner' else 'Сотрудник'),
    }


def perms_of(cur, actor):
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


def my_warehouses(actor, perms):
    """Закрытый склад не отдаём ни при каком запросе: фильтр живёт на сервере."""
    if actor['is_owner']:
        return [w['name'] for w in WAREHOUSES]
    return [w['name'] for w in WAREHOUSES if perms.get(w['key'])]


def act_meta(allowed):
    return {
        'warehouses': [
            {'key': KEY_BY_NAME[n], 'name': n} for n in allowed
        ]
    }


def act_totals(cur, allowed):
    """Плитки с количеством по каждому складу — сразу видно, где что скопилось."""
    if not allowed:
        return {'totals': []}
    names = ','.join(f"'{_esc(n)}'" for n in allowed)
    cur.execute(
        f"SELECT warehouse, COUNT(*) AS n FROM receiving_items "
        f"WHERE warehouse IN ({names}) GROUP BY warehouse"
    )
    found = {r['warehouse']: int(r['n']) for r in cur.fetchall()}
    return {'totals': [{'name': n, 'qty': found.get(n, 0)} for n in allowed]}


def act_groups(cur, allowed, params):
    """Остаток склада — по техническим наименованиям, поштучно."""
    wh = (params.get('warehouse') or '').strip()
    if wh not in allowed:
        return None, 'Этот склад вам не открыт'
    q = (params.get('q') or '').strip()
    where = f"warehouse='{_esc(wh)}'"
    if len(q) >= 2:
        e = _esc(q)
        where += (
            f" AND (tech_name ILIKE '%{e}%' OR supplier_barcode ILIKE '%{e}%' "
            f"OR factory_barcode ILIKE '%{e}%' OR brand ILIKE '%{e}%')"
        )
    cur.execute(
        f"SELECT btrim(tech_name) AS tech_name, COUNT(*) AS qty FROM receiving_items "
        f"WHERE {where} GROUP BY 1 ORDER BY qty DESC, 1 LIMIT 200"
    )
    rows = [{'tech_name': r['tech_name'], 'qty': int(r['qty'])} for r in cur.fetchall()]
    return {'rows': rows, 'warehouse': wh}, None


def act_units(cur, allowed, params):
    """Раскрытие группы: конкретные единицы с их штрихкодами."""
    wh = (params.get('warehouse') or '').strip()
    if wh not in allowed:
        return None, 'Этот склад вам не открыт'
    tech = (params.get('tech_name') or '').strip()
    if not tech:
        return None, 'Не указано наименование'
    cur.execute(
        f"SELECT {ITEM_COLS} FROM receiving_items "
        f"WHERE warehouse='{_esc(wh)}' AND btrim(tech_name)='{_esc(tech)}' "
        f"ORDER BY id LIMIT 300"
    )
    return {'rows': [dict(r) for r in cur.fetchall()]}, None


def act_find(cur, allowed, params):
    """Выстрел сканера в режиме перемещения: единица ищется по любому из её кодов."""
    code = (params.get('code') or '').strip()
    if not code:
        return {'found': False}, None
    e = _esc(code)
    cur.execute(
        f"SELECT {ITEM_COLS} FROM receiving_items "
        f"WHERE supplier_barcode='{e}' OR factory_barcode='{e}' "
        f"OR factory_barcode_2='{e}' OR order_number='{e}' LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return {'found': False, 'code': code}, None
    item = dict(row)
    if not item['warehouse']:
        return {'found': False, 'code': code, 'reason': 'not_checked'}, None
    if item['warehouse'] not in allowed:
        return {'found': False, 'code': code, 'reason': 'no_access'}, None
    return {'found': True, 'item': item}, None


def act_move(cur, actor, allowed, body):
    """Перемещение без документов: сменили склад и записали строку в историю."""
    ids = body.get('item_ids') or []
    if not isinstance(ids, list) or not ids:
        return None, 'Не выбрано, что перемещать'
    target = (body.get('warehouse_to') or '').strip()
    if target not in allowed:
        return None, 'Этот склад вам не открыт'

    clean = [int(i) for i in ids if str(i).isdigit()][:300]
    if not clean:
        return None, 'Не выбрано, что перемещать'
    id_list = ','.join(str(i) for i in clean)

    cur.execute(
        f"SELECT id, warehouse FROM receiving_items WHERE id IN ({id_list})"
    )
    found = {int(r['id']): r['warehouse'] for r in cur.fetchall()}
    if not found:
        return None, 'Единицы не найдены'

    moved, skipped = [], 0
    for item_id, src in found.items():
        if src not in allowed:
            skipped += 1
            continue
        if src == target:
            skipped += 1
            continue
        moved.append((item_id, src))

    if not moved:
        return None, 'Нечего перемещать: товар уже на этом складе'

    mid = int(actor['manager_id']) if actor['manager_id'] else 'NULL'
    moved_ids = ','.join(str(i) for i, _ in moved)
    cur.execute(
        f"UPDATE receiving_items SET warehouse='{_esc(target)}' WHERE id IN ({moved_ids})"
    )
    values = ','.join(
        f"({i}, {'NULL' if not src else chr(39) + _esc(src) + chr(39)}, "
        f"'{_esc(target)}', {mid}, '{_esc(actor['name'])}')"
        for i, src in moved
    )
    cur.execute(
        f"INSERT INTO receiving_moves (item_id, warehouse_from, warehouse_to, moved_by, moved_by_name) "
        f"VALUES {values} RETURNING id"
    )
    move_ids = [int(r['id']) for r in cur.fetchall()]
    return {
        'ok': True,
        'moved': len(moved),
        'skipped': skipped,
        'move_ids': move_ids,
        'warehouse_to': target,
    }, None


def act_undo_move(cur, actor, allowed, body):
    """Двинул не туда — откат последнего перемещения, пока мастер стоит у стеллажа."""
    ids = body.get('move_ids') or []
    clean = [int(i) for i in ids if str(i).isdigit()][:300]
    if not clean:
        return None, 'Нечего отменять'
    id_list = ','.join(str(i) for i in clean)
    cur.execute(
        f"SELECT id, item_id, warehouse_from, warehouse_to FROM receiving_moves "
        f"WHERE id IN ({id_list})"
    )
    rows = [dict(r) for r in cur.fetchall()]
    if not rows:
        return None, 'Это перемещение уже не отменить'

    undone = []
    for r in rows:
        src = r['warehouse_from']
        if src and src not in allowed:
            continue
        value = f"'{_esc(src)}'" if src else 'NULL'
        cur.execute(
            f"UPDATE receiving_items SET warehouse={value} "
            f"WHERE id={int(r['item_id'])} AND warehouse='{_esc(r['warehouse_to'])}' RETURNING id"
        )
        if cur.fetchone():
            undone.append(int(r['id']))
    if not undone:
        return None, 'Это перемещение уже не отменить'
    # Стираем только откаченное: если единицу успели двинуть дальше,
    # её след в истории должен остаться.
    cur.execute(
        f"DELETE FROM receiving_moves WHERE id IN ({','.join(str(i) for i in undone)})"
    )
    return {'ok': True, 'restored': len(undone), 'kept': len(rows) - len(undone)}, None


def act_history(cur, params):
    """Весь путь единицы: когда «потерялся» товар, история отвечает, кто двинул последним."""
    item_id = int(params.get('item_id') or 0)
    if not item_id:
        return None, 'Не указана единица'
    cur.execute(
        f"SELECT id, warehouse_from, warehouse_to, moved_by_name, moved_at "
        f"FROM receiving_moves WHERE item_id={item_id} ORDER BY id DESC LIMIT 50"
    )
    moves = [dict(r) for r in cur.fetchall()]
    cur.execute(
        f"SELECT check_result, warehouse, checked_at, checked_by_name "
        f"FROM receiving_items WHERE id={item_id} LIMIT 1"
    )
    row = cur.fetchone()
    return {'moves': moves, 'check': dict(row) if row else None}, None


def handler(event: dict, context) -> dict:
    """Склады приёмки: остатки по техническим наименованиям, раскрытие до конкретных единиц, перемещение сканером или списком без накладных, отмена последнего перемещения и история пути каждой единицы."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'receiving-stock'})

    body = {}
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        action = body.get('action', action)

    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
        if not actor:
            return _resp(401, {'error': 'Войдите заново'})
        perms = perms_of(cur, actor)
        allowed = my_warehouses(actor, perms)

        if action == 'meta':
            return _resp(200, act_meta(allowed))
        if action == 'totals':
            return _resp(200, act_totals(cur, allowed))
        if not allowed:
            return _resp(403, {'error': 'Склады вам не открыты'})

        handlers = {
            'groups': lambda: act_groups(cur, allowed, params),
            'units': lambda: act_units(cur, allowed, params),
            'find': lambda: act_find(cur, allowed, params),
            'history': lambda: act_history(cur, params),
            'move': lambda: act_move(cur, actor, allowed, body),
            'undo_move': lambda: act_undo_move(cur, actor, allowed, body),
        }
        if action in handlers:
            data, err = handlers[action]()
            return _resp(400, {'error': err}) if err else _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})