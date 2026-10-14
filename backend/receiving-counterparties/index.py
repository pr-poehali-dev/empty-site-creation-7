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

FIELDS = ('name', 'inn', 'phone', 'contact', 'comment')
COLS = 'id, name, inn, phone, contact, comment, is_archived, created_by_name, created_at, updated_at'


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json', **CORS},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _esc(s):
    return str(s).replace("'", "''")


def _val(v):
    v = (str(v) if v is not None else '').strip()
    return f"'{_esc(v)}'" if v else 'NULL'


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
    is_owner = u['role'] == 'owner'
    return {
        'is_owner': is_owner,
        'manager_id': m['id'] if m else None,
        'role_id': m['role_id'] if m else None,
        'name': name or ('Владелец' if is_owner else 'Сотрудник'),
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


def _clean(body):
    data = {f: (str(body.get(f) or '')).strip() for f in FIELDS}
    if not data['name']:
        return None, 'Укажите название'
    if len(data['name']) > 300:
        return None, 'Слишком длинное название'
    inn = re.sub(r'\s', '', data['inn'])
    if inn and not re.fullmatch(r'\d{10}|\d{12}', inn):
        return None, 'ИНН — 10 или 12 цифр'
    data['inn'] = inn
    return data, None


def _dup(cur, data, skip_id=0):
    """Тот же ИНН или то же название — скорее всего, контрагент уже заведён."""
    parts = [f"lower(btrim(name))=lower('{_esc(data['name'])}')"]
    if data['inn']:
        parts.append(f"inn='{_esc(data['inn'])}'")
    cur.execute(
        f"SELECT id, name, inn FROM receiving_counterparties "
        f"WHERE ({' OR '.join(parts)}) AND id<>{int(skip_id)} LIMIT 1"
    )
    return cur.fetchone()


def act_list(cur, params):
    q = (params.get('q') or '').strip()
    archived = str(params.get('archived') or '') == '1'
    where = [f"is_archived={'true' if archived else 'false'}"]
    for w in q.split()[:5]:
        e = _esc(w)
        where.append(
            f"(name ILIKE '%{e}%' OR COALESCE(inn,'') ILIKE '%{e}%' "
            f"OR COALESCE(phone,'') ILIKE '%{e}%' OR COALESCE(contact,'') ILIKE '%{e}%')"
        )
    cur.execute(
        f"SELECT {COLS} FROM receiving_counterparties WHERE {' AND '.join(where)} "
        f"ORDER BY lower(name) LIMIT 300"
    )
    return {'rows': [dict(r) for r in cur.fetchall()]}, None


def act_save(cur, actor, body):
    data, err = _clean(body)
    if err:
        return None, err
    cid = int(body.get('id') or 0)
    if not body.get('force'):
        d = _dup(cur, data, cid)
        if d:
            return {'duplicate': dict(d)}, None
    if cid:
        sets = ', '.join(f"{f}={_val(data[f])}" for f in FIELDS)
        cur.execute(
            f"UPDATE receiving_counterparties SET {sets}, updated_at=now() "
            f"WHERE id={cid} RETURNING {COLS}"
        )
        row = cur.fetchone()
        if not row:
            return None, 'Контрагент не найден'
        return {'ok': True, 'row': dict(row)}, None
    cur.execute(
        f"INSERT INTO receiving_counterparties (name, inn, phone, contact, comment, created_by_name) "
        f"VALUES ('{_esc(data['name'])}', {_val(data['inn'])}, {_val(data['phone'])}, "
        f"{_val(data['contact'])}, {_val(data['comment'])}, '{_esc(actor['name'])}') RETURNING {COLS}"
    )
    return {'ok': True, 'row': dict(cur.fetchone())}, None


def act_archive(cur, body):
    cid = int(body.get('id') or 0)
    flag = 'true' if body.get('archived', True) else 'false'
    cur.execute(
        f"UPDATE receiving_counterparties SET is_archived={flag}, updated_at=now() "
        f"WHERE id={cid} RETURNING id"
    )
    if not cur.fetchone():
        return None, 'Контрагент не найден'
    return {'ok': True}, None


def handler(event: dict, context) -> dict:
    """Справочник контрагентов приёмки: список с поиском, добавление и правка (название, ИНН, телефон, контактное лицо, комментарий), архив. Права: «Контрагенты: видит» и «Контрагенты: правит»."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'receiving-counterparties'})

    body = {}
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        action = body.get('action', action)

    with psycopg2.connect(os.environ['DATABASE_URL']) as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
        if not actor:
            return _resp(401, {'error': 'Войдите заново'})
        perms = perms_of(cur, actor)
        can_see = actor['is_owner'] or perms.get('cp_see') or perms.get('cp_edit')
        can_edit = actor['is_owner'] or perms.get('cp_edit')

        if action == 'meta':
            return _resp(200, {'can_see': bool(can_see), 'can_edit': bool(can_edit)})
        if not can_see:
            return _resp(403, {'error': 'Контрагенты вам не открыты'})
        if action == 'list':
            data, err = act_list(cur, params)
            return _resp(400, {'error': err}) if err else _resp(200, data)
        if action in ('save', 'archive'):
            if not can_edit:
                return _resp(403, {'error': 'Нет права править контрагентов'})
            data, err = act_save(cur, actor, body) if action == 'save' else act_archive(cur, body)
            return _resp(400, {'error': err}) if err else _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})