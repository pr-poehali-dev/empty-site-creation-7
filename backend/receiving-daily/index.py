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

WAREHOUSES = {
    'sale': 'СГП',
    'wipe': 'Протирка',
    'repair': 'Под ремонт',
    'scrap': 'Утиль',
}

ITEM_COLS = (
    'id, supplier_barcode, tech_name, serial_number, declared_defect, brand, model, '
    'product_group, direction, order_number, supplier_code, weight_gross, weight_net, '
    'has_package, invoice_weight, factory_barcode, defect_confirmed, new_defect, '
    'new_defect_text, check_result, warehouse, checked_at, checked_by_name, daily_receiving_id'
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


def autoclose_past(cur, actor, work_date):
    """Сутки кончились — кончилась и приёмка. Кнопку нажать забывают,
    и без этого забытые приёмки висели бы открытыми вечно.

    Дату «сегодня» берём с телефона мастера: часовые пояса у всех свои.
    Чужие приёмки не трогаем — их «сегодня» нам неизвестно.
    """
    if not work_date:
        return 0
    cur.execute(
        f"UPDATE daily_receivings SET closed=true, auto_closed=true, closed_at=now() "
        f"WHERE closed=false AND work_date<'{work_date}' AND {_owner_filter(actor)} "
        f"RETURNING id"
    )
    return len(cur.fetchall())


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


GOODS_FIELDS = (
    'model', 'tech_name', 'supplier_barcode', 'factory_barcode',
    'order_number', 'brand', 'product_group',
)


def goods_match(q):
    """Поиск по товару: все слова должны найтись, каждое в любом из полей.
    Используется и внутри приёмки, и при отборе приёмок по товару."""
    words = [w for w in (q or '').split() if len(w) >= 2][:5]
    if not words:
        return ''
    parts = []
    for w in words:
        e = _esc(w)
        ors = ' OR '.join(f"{f} ILIKE '%{e}%'" for f in GOODS_FIELDS)
        parts.append(f"({ors})")
    return ' AND '.join(parts)


def checked_list(cur, receiving_id, limit=30, q=''):
    where = f"daily_receiving_id={int(receiving_id)}"
    match = goods_match(q)
    if match:
        where += f" AND {match}"
    cur.execute(
        f"SELECT {ITEM_COLS} FROM receiving_items WHERE {where} "
        f"ORDER BY checked_at DESC NULLS LAST, id DESC LIMIT {int(limit)}"
    )
    return [dict(r) for r in cur.fetchall()]


def state(cur, receiving, limit=30, q=''):
    return {
        'receiving': receiving,
        'counters': counters(cur, receiving['id']),
        'items': checked_list(cur, receiving['id'], limit, q),
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
    autoclose_past(cur, actor, work_date)
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
    # Закрытую смотрят целиком, в открытой список — для контроля последних пиков.
    limit = min(int(params.get('limit') or (500 if row['closed'] else 30)), 500)
    data = state(cur, row, limit, params.get('q') or '')
    # Чужую приёмку удалить нельзя — экран не должен показывать кнопку впустую.
    data['can_delete'] = bool(own or actor['is_owner'])
    return data, None


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


def act_delete(cur, actor, body):
    """Удалить можно только пустую закрытую приёмку и только свою.
    Владелец — любую подходящую. Условия проверяем здесь, а не верим экрану:
    пока список висел открытым, в приёмку могли дописать товар."""
    rid = int(body.get('id') or 0)
    if not rid:
        return None, 'Не указана приёмка'

    cur.execute(f"SELECT * FROM daily_receivings WHERE id={rid} LIMIT 1")
    row = cur.fetchone()
    if not row:
        return None, 'Приёмка не найдена'
    row = dict(row)

    own = (row['manager_id'] == actor['manager_id']) if actor['manager_id'] else row['is_owner']
    if not own and not actor['is_owner']:
        return None, 'Чужую приёмку удалить нельзя'

    if not row['closed']:
        return None, 'Сначала закончите приёмку'

    cur.execute(
        f"SELECT COUNT(*) AS n FROM receiving_items WHERE daily_receiving_id={rid}"
    )
    if int(cur.fetchone()['n']) > 0:
        return None, 'В приёмке есть товар — такую не удаляем'

    cur.execute(f"DELETE FROM daily_receivings WHERE id={rid} RETURNING id")
    if not cur.fetchone():
        return None, 'Не удалось удалить'
    return {'ok': True, 'deleted': rid}, None


def act_scan(cur, params):
    """Выстрел сканера: только штрихкод поставщика — он один индивидуален.
    Заводской код общий на всю позицию, по нему вернулась бы случайная единица."""
    code = (params.get('code') or '').strip()
    if not code:
        return {'found': False}, None
    e = _esc(code)
    cur.execute(
        f"SELECT {ITEM_COLS} FROM receiving_items "
        f"WHERE supplier_barcode='{e}' LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return {'found': False, 'code': code}, None
    return {'found': True, 'item': dict(row)}, None


def act_search(cur, params):
    """Поиск по мере ввода: только по индивидуальным полям единицы —
    штрихкод поставщика и номер заказ-наряда. Заводской код сюда не берём."""
    q = (params.get('q') or '').strip()
    if len(q) < 2:
        return {'rows': []}, None
    e = _esc(q)
    cur.execute(
        f"SELECT {ITEM_COLS} FROM receiving_items "
        f"WHERE supplier_barcode ILIKE '%{e}%' OR order_number ILIKE '%{e}%' "
        f"ORDER BY id LIMIT 15"
    )
    return {'rows': [dict(r) for r in cur.fetchall()]}, None


def _pick_weight(item, has_package):
    """Вес для накладной берём из файла: с упаковкой — брутто, без неё — нетто.
    Нужного веса в файле нет — ставим тот, что есть, иначе оставляем пустым."""
    gross, net = item.get('weight_gross'), item.get('weight_net')
    first, second = (gross, net) if has_package else (net, gross)
    return first if first is not None else second


def act_check(cur, actor, body):
    """Исход проверки по конкретной единице: склад, вес для накладной, дефекты."""
    item_id = int(body.get('item_id') or 0)
    rid = int(body.get('receiving_id') or 0)
    outcome = body.get('outcome') or ''
    if not item_id or not rid:
        return None, 'Не указана единица или приёмка'
    if outcome not in OUTCOMES:
        return None, 'Неизвестный исход проверки'

    cur.execute(f"SELECT {ITEM_COLS} FROM receiving_items WHERE id={item_id} LIMIT 1")
    item = cur.fetchone()
    if not item:
        return None, 'Единица не найдена'

    has_package = body.get('has_package')
    sets = [
        f"check_result='{_esc(outcome)}'",
        f"warehouse='{_esc(WAREHOUSES[outcome])}'",
        f"daily_receiving_id={rid}",
        f"checked_by_name='{_esc(actor['name'])}'",
        'checked_at=now()',
    ]
    sets.append(
        f"checked_by={int(actor['manager_id'])}" if actor['manager_id'] else 'checked_by=NULL'
    )
    if has_package is not None:
        weight = _pick_weight(item, bool(has_package))
        sets.append(f"has_package={'true' if has_package else 'false'}")
        sets.append(f"invoice_weight={'NULL' if weight is None else weight}")

    if outcome == 'repair':
        confirmed = bool(body.get('defect_confirmed'))
        new_defect = bool(body.get('new_defect'))
        text = (body.get('new_defect_text') or '').strip() if new_defect else ''
        sets.append(f"defect_confirmed={'true' if confirmed else 'false'}")
        sets.append(f"new_defect={'true' if new_defect else 'false'}")
        sets.append(f"new_defect_text='{_esc(text)}'" if text else 'new_defect_text=NULL')

    cur.execute(f"UPDATE receiving_items SET {', '.join(sets)} WHERE id={item_id} RETURNING id")
    if not cur.fetchone():
        return None, 'Не удалось записать проверку'
    return {'ok': True, 'counters': counters(cur, rid)}, None


def act_factory(cur, body):
    """Заводской штрихкод размножается по позиции: группа + бренд + модель.
    По техническому наименованию нельзя — поставщик дописывает слэш с номером,
    и все 16 945 наименований разные, код лёг бы на одну единицу."""
    item_id = int(body.get('item_id') or 0)
    code = (body.get('code') or '').strip()
    if not item_id or not code:
        return None, 'Не указан товар или код'

    cur.execute(
        f"SELECT tech_name, product_group, brand, model "
        f"FROM receiving_items WHERE id={item_id} LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return None, 'Единица не найдена'

    tech = (row['tech_name'] or '').strip()
    g = (row['product_group'] or '').strip()
    b = (row['brand'] or '').strip()
    m = (row['model'] or '').strip()

    if g or b or m:
        where = (
            f"btrim(COALESCE(product_group,''))='{_esc(g)}' AND "
            f"btrim(COALESCE(brand,''))='{_esc(b)}' AND "
            f"btrim(COALESCE(model,''))='{_esc(m)}'"
        )
    else:
        where = f"id={item_id}"

    e = _esc(code)
    cur.execute(
        f"UPDATE receiving_items SET factory_barcode='{e}' "
        f"WHERE {where} AND (factory_barcode IS NULL OR factory_barcode='') RETURNING id"
    )
    return {'ok': True, 'updated': len(cur.fetchall()), 'tech_name': tech}, None


def act_undo(cur, actor, body):
    """Тапнул не ту кнопку — откат последнего исхода, чтобы не искать единицу заново."""
    item_id = int(body.get('item_id') or 0)
    rid = int(body.get('receiving_id') or 0)
    if not item_id or not rid:
        return None, 'Не указана единица или приёмка'
    cur.execute(
        f"UPDATE receiving_items SET check_result=NULL, warehouse=NULL, checked_at=NULL, "
        f"checked_by=NULL, checked_by_name=NULL, daily_receiving_id=NULL, has_package=NULL, "
        f"invoice_weight=NULL, defect_confirmed=NULL, new_defect=NULL, new_defect_text=NULL "
        f"WHERE id={item_id} AND daily_receiving_id={rid} RETURNING id"
    )
    if not cur.fetchone():
        return None, 'Эту проверку уже не отменить'
    return {'ok': True, 'counters': counters(cur, rid)}, None


def act_list(cur, actor, params):
    """Список приёмок: свои или всех — по праву see_all_lists.

    Фильтры по датам и поиск по товару отбирают по всей базе, а не по
    показанной порции: мастер ищет модель трёхмесячной давности и должен её найти.
    Счётчики по исходам считаются одним запросом на все строки сразу — иначе
    на полусотне приёмок экран думал бы секундами.
    """
    # Заодно подчищаем забытые: список — первое место, где видна чужая небрежность.
    autoclose_past(cur, actor, _date(params.get('today')))

    parts = ["1=1"]

    date_from = _date(params.get('date_from')) or _date(params.get('work_date'))
    date_to = _date(params.get('date_to')) or _date(params.get('work_date'))
    if date_from:
        parts.append(f"d.work_date>='{date_from}'")
    if date_to:
        parts.append(f"d.work_date<='{date_to}'")

    # mine=1 — свой список даже у того, кто вправе видеть чужие.
    mine = str(params.get('mine') or '') == '1'
    if mine or not actor['_see_all']:
        parts.append(_owner_filter(actor))

    kind = (params.get('kind') or '').strip()
    if kind in KINDS:
        parts.append(f"d.kind='{_esc(kind)}'")

    exclude = int(params.get('exclude') or 0)
    if exclude:
        parts.append(f"d.id<>{exclude}")

    if str(params.get('closed_only') or '') == '1':
        parts.append("d.closed=true")

    match = goods_match(params.get('q') or '')
    if match:
        parts.append(
            f"EXISTS (SELECT 1 FROM receiving_items i "
            f"WHERE i.daily_receiving_id=d.id AND {match})"
        )

    where = ' AND '.join(parts)
    limit = min(int(params.get('limit') or 5), 100)
    offset = max(int(params.get('offset') or 0), 0)

    cur.execute(f"SELECT COUNT(*) AS n FROM daily_receivings d WHERE {where}")
    total = int(cur.fetchone()['n'])

    cur.execute(
        f"SELECT d.*, (SELECT COUNT(*) FROM receiving_items i "
        f"WHERE i.daily_receiving_id=d.id) AS qty "
        f"FROM daily_receivings d WHERE {where} "
        f"ORDER BY d.work_date DESC, d.id DESC LIMIT {limit} OFFSET {offset}"
    )
    rows = [dict(r) for r in cur.fetchall()]

    # Кнопку удаления рисуем только там, где сервер и правда удалит.
    for r in rows:
        own = (
            (r['manager_id'] == actor['manager_id']) if actor['manager_id']
            else r['is_owner']
        )
        r['can_delete'] = bool(
            (own or actor['is_owner']) and r['closed'] and int(r['qty']) == 0
        )

    ids = [int(r['id']) for r in rows]
    if ids:
        joined = ','.join(str(i) for i in ids)
        cur.execute(
            f"SELECT daily_receiving_id AS rid, check_result AS r, COUNT(*) AS n "
            f"FROM receiving_items WHERE daily_receiving_id IN ({joined}) "
            f"AND check_result IS NOT NULL GROUP BY 1,2"
        )
        by_id = {i: {o: 0 for o in OUTCOMES} for i in ids}
        for row in cur.fetchall():
            if row['r'] in by_id[row['rid']]:
                by_id[row['rid']][row['r']] = int(row['n'])
        for r in rows:
            r['counters'] = by_id[int(r['id'])]

    return {'rows': rows, 'total': total, 'see_all': actor['_see_all']}, None


def handler(event: dict, context) -> dict:
    """Дневная приёмка: открыть или продолжить сессию за день, сканировать товар, искать по штрихкоду и заказ-наряду, записывать исход проверки с упаковкой и весом, проставлять заводской штрихкод по всей модели, отменять последнее действие, считать исходы, закрывать приёмку и удалять пустую закрытую."""
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
            'delete': lambda: act_delete(cur, actor, body),
            'check': lambda: act_check(cur, actor, body),
            'factory': lambda: act_factory(cur, body),
            'undo': lambda: act_undo(cur, actor, body),
        }
        if action in handlers:
            data, err = handlers[action]()
            return _resp(400, {'error': err}) if err else _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})