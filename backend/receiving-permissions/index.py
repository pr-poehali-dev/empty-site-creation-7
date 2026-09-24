import json
import os

import psycopg2
from psycopg2.extras import RealDictCursor

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token, X-Session-Id, X-User-Phone',
    'Access-Control-Max-Age': '86400',
}

PERMS = [
    {'key': 'kind_plain', 'group': 'Виды приёмки', 'title': 'Приёмка рабочего товара без проверки'},
    {'key': 'kind_check', 'group': 'Виды приёмки', 'title': 'Приёмка рабочего товара с проверкой'},
    {'key': 'kind_repair', 'group': 'Виды приёмки', 'title': 'Приёмка товара под ремонт'},
    {'key': 'upload_files', 'group': 'Действия', 'title': 'Загрузка файлов поставщиков'},
    {'key': 'catalog_edit', 'group': 'Действия', 'title': 'Каталог приёмки: сборка и правка'},
    {'key': 'delete_data', 'group': 'Действия', 'title': 'Удаление загрузок и позиций'},
    {'key': 'manage_perms', 'group': 'Действия', 'title': 'Настройка приёмочных прав'},
    {'key': 'wh_sgp', 'group': 'Склады', 'title': 'СГП'},
    {'key': 'wh_wipe', 'group': 'Склады', 'title': 'Протирка'},
    {'key': 'wh_repair', 'group': 'Склады', 'title': 'Под ремонт'},
    {'key': 'wh_scrap', 'group': 'Склады', 'title': 'Утиль'},
    {'key': 'see_all_lists', 'group': 'Видимость', 'title': 'Видит списки всех сотрудников'},
    {'key': 'name_beauty', 'group': 'Видимость', 'title': 'Показывать красивые наименования'},
    {'key': 'name_tech', 'group': 'Видимость', 'title': 'Показывать технические наименования'},
    {'key': 'catalog_switch', 'group': 'Заявки', 'title': 'Переключатель каталога в заявках'},
]

PERM_KEYS = {p['key'] for p in PERMS}
HIDDEN_ROLES = ('Оптовик',)


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


def who(cur, phone):
    """Определяет владельца и карточку сотрудника по телефону."""
    if not phone:
        return {'is_owner': False, 'manager_id': None, 'role_id': None, 'role_name': None}
    cur.execute(f"SELECT role FROM users WHERE phone='{_esc(phone)}' LIMIT 1")
    u = cur.fetchone()
    is_owner = bool(u and (u['role'] if isinstance(u, dict) else u[0]) == 'owner')
    cur.execute(
        f"SELECT m.id, m.role_id, r.name AS role_name FROM managers m "
        f"LEFT JOIN roles r ON r.id=m.role_id WHERE m.phone='{_esc(phone)}' LIMIT 1"
    )
    m = cur.fetchone()
    return {
        'is_owner': is_owner,
        'manager_id': m['id'] if m else None,
        'role_id': m['role_id'] if m else None,
        'role_name': m['role_name'] if m else None,
    }


def effective(cur, actor):
    """Итоговые права: владельцу всё, остальным роль плюс личные переопределения."""
    if actor['is_owner']:
        return {k: True for k in PERM_KEYS}
    result = {k: False for k in PERM_KEYS}
    if actor['role_id']:
        cur.execute(
            f"SELECT perm_key, enabled FROM receiving_permissions "
            f"WHERE role_id={int(actor['role_id'])}"
        )
        for r in cur.fetchall():
            if r['perm_key'] in result:
                result[r['perm_key']] = r['enabled']
    if actor['manager_id']:
        cur.execute(
            f"SELECT perm_key, enabled FROM receiving_permissions "
            f"WHERE manager_id={int(actor['manager_id'])}"
        )
        for r in cur.fetchall():
            if r['perm_key'] in result:
                result[r['perm_key']] = r['enabled']
    return result


def my_permissions(phone):
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, phone)
        return {
            'is_owner': actor['is_owner'],
            'role_name': actor['role_name'],
            'permissions': effective(cur, actor),
        }


def matrix(phone):
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, phone)
        perms = effective(cur, actor)
        if not actor['is_owner'] and not perms.get('manage_perms'):
            return None, 'Нет доступа к настройке прав'

        hidden = ','.join("'" + _esc(x) + "'" for x in HIDDEN_ROLES)
        cur.execute(f"SELECT id, name, description FROM roles WHERE name NOT IN ({hidden}) ORDER BY id")
        roles = [dict(r) for r in cur.fetchall()]

        cur.execute(
            f"SELECT m.id, m.first_name, m.last_name, m.status, m.role_id, r.name AS role_name "
            f"FROM managers m LEFT JOIN roles r ON r.id=m.role_id "
            f"WHERE m.status='authorized' AND (r.name IS NULL OR r.name NOT IN ({hidden})) "
            f"ORDER BY m.id"
        )
        people = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT role_id, manager_id, perm_key, enabled FROM receiving_permissions")
        role_perms, mgr_perms = {}, {}
        for r in cur.fetchall():
            if r['role_id']:
                role_perms.setdefault(str(r['role_id']), {})[r['perm_key']] = r['enabled']
            elif r['manager_id']:
                mgr_perms.setdefault(str(r['manager_id']), {})[r['perm_key']] = r['enabled']

        return {
            'perms': PERMS,
            'roles': roles,
            'people': people,
            'role_perms': role_perms,
            'manager_perms': mgr_perms,
        }, None


def set_perm(phone, role_id, manager_id, perm_key, enabled):
    if perm_key not in PERM_KEYS:
        return None, 'Неизвестное право'
    if bool(role_id) == bool(manager_id):
        return None, 'Укажите роль или сотрудника'

    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, phone)
        perms = effective(cur, actor)
        if not actor['is_owner'] and not perms.get('manage_perms'):
            return None, 'Нет доступа к настройке прав'

        flag = 'true' if enabled else 'false'
        if role_id:
            cur.execute(
                f"INSERT INTO receiving_permissions (role_id, perm_key, enabled) "
                f"VALUES ({int(role_id)}, '{_esc(perm_key)}', {flag}) "
                f"ON CONFLICT (role_id, perm_key) WHERE role_id IS NOT NULL "
                f"DO UPDATE SET enabled=EXCLUDED.enabled, updated_at=NOW()"
            )
        else:
            cur.execute(
                f"INSERT INTO receiving_permissions (manager_id, perm_key, enabled) "
                f"VALUES ({int(manager_id)}, '{_esc(perm_key)}', {flag}) "
                f"ON CONFLICT (manager_id, perm_key) WHERE manager_id IS NOT NULL "
                f"DO UPDATE SET enabled=EXCLUDED.enabled, updated_at=NOW()"
            )
    return {'ok': True}, None


def reset_person(phone, manager_id):
    """Убирает личные переопределения — человек снова наследует права роли."""
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, phone)
        perms = effective(cur, actor)
        if not actor['is_owner'] and not perms.get('manage_perms'):
            return None, 'Нет доступа к настройке прав'
        cur.execute(f"DELETE FROM receiving_permissions WHERE manager_id={int(manager_id)}")
    return {'ok': True}, None


def handler(event: dict, context) -> dict:
    """Приёмочные права: итоговые права текущего пользователя, матрица настроек по ролям и сотрудникам, переключение галочек."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    headers = event.get('headers') or {}
    phone = headers.get('X-User-Phone') or headers.get('x-user-phone') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET':
        if not action:
            return _resp(200, {'status': 'ok', 'service': 'receiving-permissions'})
        if action == 'my':
            return _resp(200, my_permissions(phone))
        if action == 'matrix':
            data, err = matrix(phone)
            if err:
                return _resp(403, {'error': err})
            return _resp(200, data)
        return _resp(400, {'error': 'Неизвестное действие'})

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Тело запроса не разобрать'})

    action = body.get('action') or action
    phone = body.get('phone') or phone

    if action == 'set_perm':
        data, err = set_perm(phone, body.get('role_id'), body.get('manager_id'),
                             body.get('perm_key'), bool(body.get('enabled')))
        if err:
            return _resp(403 if 'доступ' in err else 400, {'error': err})
        return _resp(200, data)

    if action == 'reset_person':
        if not body.get('manager_id'):
            return _resp(400, {'error': 'Не указан сотрудник'})
        data, err = reset_person(phone, body['manager_id'])
        if err:
            return _resp(403, {'error': err})
        return _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})