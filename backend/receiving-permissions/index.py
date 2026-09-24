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

PERMS = [
    {'key': 'kind_plain', 'group': 'Виды приёмки', 'title': 'Приёмка рабочего товара без проверки'},
    {'key': 'kind_check', 'group': 'Виды приёмки', 'title': 'Приёмка рабочего товара с проверкой'},
    {'key': 'kind_repair', 'group': 'Виды приёмки', 'title': 'Приёмка товара под ремонт'},
    {'key': 'upload_files', 'group': 'Действия', 'title': 'Загрузка файлов поставщиков'},
    {'key': 'catalog_edit', 'group': 'Действия', 'title': 'Доступ к каталогу приёмки'},
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

CATALOG_FIELDS = [
    ('supplier_barcode', 'Штрихкод поставщика'),
    ('tech_name', 'Техническое наименование'),
    ('serial_number', 'Серийный номер'),
    ('declared_defect', 'Заявленный дефект'),
    ('brand', 'Бренд'),
    ('model', 'Модель'),
    ('product_group', 'Товарная группа'),
    ('direction', 'Направление'),
    ('order_number', 'Заказ-наряд'),
    ('supplier_code', 'Код поставщика'),
    ('weight_gross', 'Вес брутто'),
    ('weight_net', 'Вес нетто'),
    ('volume', 'Объём'),
    ('has_package', 'Наличие упаковки'),
    ('invoice_weight', 'Вес по накладной'),
    ('factory_barcode', 'Заводской штрихкод'),
    ('factory_barcode_2', 'Заводской штрихкод 2'),
    ('check_result', 'Результат проверки'),
    ('defect_confirmed', 'Дефект подтверждён'),
    ('new_defect', 'Новый дефект'),
    ('new_defect_text', 'Описание нового дефекта'),
    ('checked_by_name', 'Кто проверил'),
    ('checked_at', 'Когда проверил'),
    ('warehouse', 'Склад'),
]

PRICE_FIELDS = [('price', 'Цена из загрузки')]

GROUP_FIELDS = {'product_group', 'brand', 'model', 'direction', 'price'}

for _k, _t in CATALOG_FIELDS:
    PERMS.append({'key': f'cat_see_{_k}', 'group': 'Каталог: видит', 'title': _t})
for _k, _t in CATALOG_FIELDS:
    PERMS.append({'key': f'cat_edit_{_k}', 'group': 'Каталог: правит', 'title': _t})
for _k, _t in PRICE_FIELDS:
    PERMS.append({'key': f'cat_see_{_k}', 'group': 'Цены: видит', 'title': _t})
for _k, _t in PRICE_FIELDS:
    PERMS.append({'key': f'cat_edit_{_k}', 'group': 'Цены: правит', 'title': _t})

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


ANON = {'is_owner': False, 'manager_id': None, 'role_id': None,
        'role_name': None, 'authorized': False}


def who(cur, token):
    """Опознаёт человека по токену входа: токен ищется в таблице сессий, подменить нельзя."""
    token = (token or '').replace('Bearer ', '').strip()
    if not token:
        return dict(ANON)
    cur.execute(
        f"SELECT u.role, u.phone FROM users u JOIN user_sessions s ON s.user_id=u.id "
        f"WHERE s.token='{_esc(token)}' AND s.expires_at > NOW() LIMIT 1"
    )
    u = cur.fetchone()
    if not u:
        return dict(ANON)
    cur.execute(
        f"SELECT m.id, m.role_id, r.name AS role_name FROM managers m "
        f"LEFT JOIN roles r ON r.id=m.role_id WHERE m.phone='{_esc(u['phone'])}' LIMIT 1"
    )
    m = cur.fetchone()
    return {
        'is_owner': u['role'] == 'owner',
        'manager_id': m['id'] if m else None,
        'role_id': m['role_id'] if m else None,
        'role_name': m['role_name'] if m else None,
        'authorized': True,
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


def my_permissions(token):
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
        return {
            'is_owner': actor['is_owner'],
            'role_name': actor['role_name'],
            'authorized': actor['authorized'],
            'permissions': effective(cur, actor),
        }


def matrix(token):
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
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


def set_perm(token, role_id, manager_id, perm_key, enabled):
    if perm_key not in PERM_KEYS:
        return None, 'Неизвестное право'
    if bool(role_id) == bool(manager_id):
        return None, 'Укажите роль или сотрудника'

    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
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


def reset_person(token, manager_id):
    """Убирает личные переопределения — человек снова наследует права роли."""
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        actor = who(cur, token)
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
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET':
        if not action:
            return _resp(200, {'status': 'ok', 'service': 'receiving-permissions'})
        if action == 'my':
            return _resp(200, my_permissions(token))
        if action == 'matrix':
            data, err = matrix(token)
            if err:
                return _resp(403, {'error': err})
            return _resp(200, data)
        return _resp(400, {'error': 'Неизвестное действие'})

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Тело запроса не разобрать'})

    action = body.get('action') or action

    if action == 'set_perm':
        data, err = set_perm(token, body.get('role_id'), body.get('manager_id'),
                             body.get('perm_key'), bool(body.get('enabled')))
        if err:
            return _resp(403 if 'доступ' in err else 400, {'error': err})
        return _resp(200, data)

    if action == 'reset_person':
        if not body.get('manager_id'):
            return _resp(400, {'error': 'Не указан сотрудник'})
        data, err = reset_person(token, body['manager_id'])
        if err:
            return _resp(403, {'error': err})
        return _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})