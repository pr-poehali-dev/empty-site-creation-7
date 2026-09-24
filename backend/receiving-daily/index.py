import json
import os
import re

import psycopg2
from psycopg2.extras import RealDictCursor

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}

KINDS = {
    'kind_plain': 'Рабочий товар без проверки',
    'kind_check': 'Рабочий товар с проверкой',
    'kind_repair': 'Товар под ремонт',
}

OUTCOMES = ['sale', 'wipe', 'repair', 'scrap']

ITEM_COLS = (
    'id, supplier_barcode, tech_name, serial_number, declared_defect, brand, model, '
    'product_group, direction, order_number, supplier_code, weight_gross, weight_net, '
    'check_result, warehouse, checked_at, checked_by_name, daily_receiving_id'
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


def _date(value):
    """Дата рабочего дня приходит с телефона сотрудника — свой часовой пояс у каждого."""
    s = (value or '').strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', s):
        return s
    return None


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


def can(actor, perms, key):
    return bool(actor['is_owner'] or perms.get(key))


def _owner_filter(actor):
    """Своя приёмка: у владельца без карточки сотрудника manager_id пустой."""
    if actor['manager_id']:
        return f"manager_id={int(actor['manager_id'])}"
    return "manager_id IS NULL AND is_owner=true"


def find_open(cur, actor, kind, work_date):
    cur.execute(
        f"SELECT * FROM daily_receivings WHERE {_owner_filter(actor)} "
        f"AND kind='{_esc(kind)}' AND work_date='{work_date}' AND closed=false "
        f"ORDER BY id DESC LIMIT 1"
    )
    row = cur.fetchone()
    return dict(row) if row else None


def counters(cur, receiving_id):
    cur.execute(
        f"SELECT COALESCE(check_result,'') AS r, COUNT(*) AS n FROM receiving_items "
        f"WHERE daily_receiving_id={int(receiving_id)} GROUP BY 1"
    )
    out = {k: 0 for k in OUTCOMES}
    total = 0
    for row in cur.fetchall():
        total += int(row['n'])
        if row['r'] in out:
            out[row['r']] = int(row['n'])
    out['total'] = total
    return out


def checked_list(cur, receiving_id, limit=30):
    cur.execute(
        f"SELECT {ITEM_COLS} FROM receiving_items "
        f"WHERE daily_receiving_id={int(receiving_id)} "
        f"ORDER BY checked_at DESC NULLS LAST, id DESC LIMIT {int(limit)}"
    )
    return [dict(r) for r in cur.fetchall()]


def state(cur, receiving):
    return {
        'receiving': receiving,
        'counters': counters(cur, receiving['id']),
        'items': checked_list(cur, receiving['id']),
    }


def act_open(cur, actor, body):
    kind = body.get('kind') or ''
    if kind not in KINDS:
        return None, 'Неизвестный вид приёмки'
    work_date = _date(body.get('work_date'))
    if not work_date:
        return None, 'Не передана дата рабочего дня'
    mid = 'NULL' if not actor['manager_id'] else str(int(actor['manager_id']))
    cur.execute(
        f"INSERT INTO daily_receivings (manager_id, is_owner, employee_name, kind, work_date) "
        f"VALUES ({mid}, {'true' if actor['is_owner'] else 'false'}, "
        f"'{_esc(actor['name'])}', '{_esc(kind)}', '{work_date}') RETURNING *"
    )
    return dict(cur.fetchone()), None


def act_current(cur, actor, params):
    """Есть ли сегодня незакрытая приёмка этого вида — от этого зависит вопрос на экране."""
    kind = params.get('kind') or ''
    if kind not in KINDS:
        return None, 'Неизвестный вид приёмки'
    work_date = _date(params.get('work_date'))
    if not work_date:
        return None, 'Не передана дата рабочего дня'
    row = find_open(cur, actor, kind, work_date)
    if not row:
        return {'found': False}, None
    data = state(cur, row)
    data['found'] = True
    return data, None


def act_state(cur, actor, params):
    rid = int(params.get('id') or 0)
    if not rid:
        return None, 'Не указана приёмка'
    cur.execute(f"SELECT * FROM daily_receivings WHERE id={rid} LIMIT 1")
    row = cur.fetchone()
    if not row:
        return None, 'Приёмка не найдена'
    row = dict(row)
    own = (row['manager_id'] == actor['manager_id']) if actor['manager_id'] else row['is_owner']
    if not own and not actor['_see_all']:
        return None, 'Это чужая приёмка'
    return state(cur, row), None


def act_close(cur, actor, body):
    rid = int(body.get('id') or 0)
    if not rid:
        return None, 'Не указана приёмка'
    cur.execute(
        f"UPDATE daily_receivings SET closed=true, closed_at=now() "
        f"WHERE id={rid} AND {_owner_filter(actor)} AND closed=false RETURNING id"
    )
    if not cur.fetchone():
        return None, 'Приёмка уже закрыта или чужая'
    return {'ok': True}, None


def act_scan(cur, params):
    """Выстрел сканера: точное совпадение по штрихкоду или номеру заказ-наряда."""
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
    return {'found': True, 'item': dict(row)}, None


def act_search(cur, params):
    """Поиск по мере ввода: частичное совпадение по штрихкоду и заказ-наряду."""
    q = (params.get('q') or '').strip()
    if len(q) < 2:
        return {'rows': []}, None
    e = _esc(q)
    cur.execute(
        f"SELECT {ITEM_COLS} FROM receiving_items "
        f"WHERE supplier_barcode ILIKE '%{e}%' OR order_number ILIKE '%{e}%' "
        f"OR factory_barcode ILIKE '%{e}%' OR factory_barcode_2 ILIKE '%{e}%' "
        f"ORDER BY id LIMIT 15"
    )
    return {'rows': [dict(r) for r in cur.fetchall()]}, None


def act_list(cur, actor, params):
    """Список приёмок: свои или всех — по праву see_all_lists."""
    work_date = _date(params.get('work_date'))
    parts = ["1=1"]
    if work_date:
        parts.append(f"work_date='{work_date}'")
    if not actor['_see_all']:
        parts.append(_owner_filter(actor))
    where = ' AND '.join(parts)
    cur.execute(
        f"SELECT d.*, (SELECT COUNT(*) FROM receiving_items i "
        f"WHERE i.daily_receiving_id=d.id) AS qty "
        f"FROM daily_receivings d WHERE {where} "
        f"ORDER BY d.work_date DESC, d.id DESC LIMIT 100"
    )
    return {'rows': [dict(r) for r in cur.fetchall()]}, None


def handler(event: dict, context) -> dict:
    """Дневная приёмка: открыть или продолжить сессию за день, сканировать товар, искать по штрихкоду и заказ-наряду, считать исходы и закрывать приёмку."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'receiving-daily'})

    body = {}
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        action = body.get('action', action)

    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
        if not actor:
            return _resp(401, {'error': 'Войдите заново'})
        perms = perms_of(cur, actor)
        actor['_see_all'] = can(actor, perms, 'see_all_lists')

        kind = body.get('kind') or params.get('kind') or ''
        if kind and not can(actor, perms, kind):
            return _resp(403, {'error': 'Этот вид приёмки вам не открыт'})

        if action == 'meta':
            return _resp(200, {
                'kinds': [
                    {'key': k, 'title': t} for k, t in KINDS.items()
                    if can(actor, perms, k)
                ],
                'see_all': actor['_see_all'],
                'name': actor['name'],
            })

        handlers = {
            'current': lambda: act_current(cur, actor, params),
            'state': lambda: act_state(cur, actor, params),
            'scan': lambda: act_scan(cur, params),
            'search': lambda: act_search(cur, params),
            'list': lambda: act_list(cur, actor, params),
            'open': lambda: act_open(cur, actor, body),
            'close': lambda: act_close(cur, actor, body),
        }
        if action in handlers:
            data, err = handlers[action]()
            return _resp(400, {'error': err}) if err else _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})
