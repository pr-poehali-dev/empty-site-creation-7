"""Протирка: раздел «Рабочий товар без проверки».

Протирка — отдельная работа после мастера. Решение мастера не перезаписывается,
кроме одного случая: мастер отправил в СГП, а товар оказался на протирке —
тогда решение исправляется на «Протирка» с отметкой, кто и что было.

Итог протирки хранится в своих полях: wipe_result ('sale' — готово, в СГП;
'scrap' — утиль), внешний вид, следы, кто и когда, в какой приёмке.
"""
from worklog import local_sql, log_event

WIPE_KIND = 'kind_plain'
RESULTS = {'sale': 'СГП', 'scrap': 'Утиль'}
LOOKS = ('new', 'excellent', 'good')
TRACES = ('none', 'used')


def _esc(s):
    return str(s).replace("'", "''")


def _move(cur, item_id, wh_from, wh_to, actor, source):
    src = 'NULL' if not wh_from else f"'{_esc(wh_from)}'"
    mid = int(actor['manager_id']) if actor.get('manager_id') else 'NULL'
    cur.execute(
        f"INSERT INTO receiving_moves "
        f"(item_id, warehouse_from, warehouse_to, moved_by, moved_by_name, source) "
        f"VALUES ({int(item_id)}, {src}, '{_esc(wh_to)}', {mid}, "
        f"'{_esc(actor['name'])}', '{source}')"
    )


def own_open(cur, actor, owner_filter, rid):
    """Своя открытая приёмка протирки — иначе ни скан, ни итог не пишем."""
    cur.execute(
        f"SELECT id, kind, closed FROM daily_receivings WHERE id={int(rid)} AND {owner_filter} LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return 'Приёмка не найдена или чужая'
    if row['kind'] != WIPE_KIND:
        return 'Это не приёмка протирки'
    if row['closed']:
        return 'Приёмка закрыта'
    return None


def status_of(item):
    """Что делать с единицей на протирке. Смотрим на решение мастера, не на склад."""
    if item.get('wipe_result'):
        return 'done'
    r = item.get('check_result')
    if not r:
        return 'unchecked'
    if r in ('repair', 'scrap'):
        return r
    if r == 'sale':
        return 'sale'
    return 'ready'


def _item(cur, cols, where):
    cur.execute(f"SELECT {cols} FROM receiving_items WHERE {where} LIMIT 1")
    row = cur.fetchone()
    return dict(row) if row else None


def act_wipe_scan(cur, cols, params):
    code = (params.get('code') or '').strip()
    item_id = int(params.get('item_id') or 0)
    if item_id:
        item = _item(cur, cols, f"id={item_id}")
    elif code:
        item = _item(cur, cols, f"supplier_barcode='{_esc(code)}'")
    else:
        return {'found': False}, None
    if not item:
        return {'found': False, 'code': code}, None
    return {'found': True, 'status': status_of(item), 'item': item}, None


def act_wipe_fix(cur, cols, actor, owner_filter, body):
    """Мастер отправил в СГП, а товар на протирке: решение мастера → «Протирка»."""
    rid = int(body.get('receiving_id') or 0)
    item_id = int(body.get('item_id') or 0)
    err = own_open(cur, actor, owner_filter, rid)
    if err:
        return None, err
    item = _item(cur, cols, f"id={item_id}")
    if not item:
        return None, 'Единица не найдена'
    if status_of(item) != 'sale':
        return None, 'Этот товар так не исправить'
    cur.execute(
        f"UPDATE receiving_items SET check_result='wipe', warehouse='Протирка', "
        f"master_fixed_from='sale', master_fixed_by_name='{_esc(actor['name'])}', "
        f"master_fixed_at=now() WHERE id={item_id} AND check_result='sale' "
        f"AND wipe_result IS NULL RETURNING id"
    )
    if not cur.fetchone():
        return None, 'Не удалось исправить'
    _move(cur, item_id, item.get('warehouse'), 'Протирка', actor, 'fix')
    item = _item(cur, cols, f"id={item_id}")
    return {'ok': True, 'status': status_of(item), 'item': item}, None


def counters(cur, rid):
    cur.execute(
        f"SELECT wipe_result AS r, COUNT(*) AS n FROM receiving_items "
        f"WHERE wipe_receiving_id={int(rid)} GROUP BY 1"
    )
    out = {'sale': 0, 'wipe': 0, 'repair': 0, 'scrap': 0, 'total': 0}
    for r in cur.fetchall():
        if r['r'] in out:
            out[r['r']] = int(r['n'])
            out['total'] += int(r['n'])
    return out


def act_wipe_done(cur, cols, actor, owner_filter, body):
    rid = int(body.get('receiving_id') or 0)
    item_id = int(body.get('item_id') or 0)
    result = body.get('result') or ''
    if result not in RESULTS:
        return None, 'Неизвестный итог'
    look = body.get('look') or ''
    traces = body.get('traces') or ''
    if result == 'sale' and (look not in LOOKS or traces not in TRACES):
        return None, 'Выберите внешний вид и следы'
    err = own_open(cur, actor, owner_filter, rid)
    if err:
        return None, err
    item = _item(cur, cols, f"id={item_id}")
    if not item:
        return None, 'Единица не найдена'
    if status_of(item) != 'ready':
        return None, 'Этот товар сейчас не для протирки'
    mid = int(actor['manager_id']) if actor.get('manager_id') else 'NULL'
    lk = f"'{look}'" if result == 'sale' else 'NULL'
    tr = f"'{traces}'" if result == 'sale' else 'NULL'
    cur.execute(
        f"UPDATE receiving_items SET wipe_result='{result}', wipe_look={lk}, wipe_traces={tr}, "
        f"wipe_by={mid}, wipe_by_name='{_esc(actor['name'])}', wipe_at=now(), "
        f"wipe_local={local_sql(body.get('local_time'))}, wipe_receiving_id={rid}, "
        f"warehouse='{RESULTS[result]}' WHERE id={item_id} AND wipe_result IS NULL RETURNING id"
    )
    if not cur.fetchone():
        return None, 'Не удалось записать'
    _move(cur, item_id, item.get('warehouse'), RESULTS[result], actor, 'wipe')
    log_event(cur, actor, rid, 'result', item_id, body.get('local_time'))
    return {'ok': True, 'counters': counters(cur, rid)}, None


def act_wipe_undo(cur, actor, owner_filter, body):
    """Отмена итога протирки: товар снова на складе «Протирка», ждёт работы."""
    rid = int(body.get('receiving_id') or 0)
    item_id = int(body.get('item_id') or 0)
    err = own_open(cur, actor, owner_filter, rid)
    if err:
        return None, err
    cur.execute(f"SELECT warehouse FROM receiving_items WHERE id={item_id} AND wipe_receiving_id={rid} LIMIT 1")
    row = cur.fetchone()
    if not row:
        return None, 'Этот итог уже не отменить'
    cur.execute(
        f"UPDATE receiving_items SET wipe_result=NULL, wipe_look=NULL, wipe_traces=NULL, "
        f"wipe_by=NULL, wipe_by_name=NULL, wipe_at=NULL, wipe_local=NULL, wipe_receiving_id=NULL, "
        f"warehouse='Протирка' WHERE id={item_id} AND wipe_receiving_id={rid} RETURNING id"
    )
    if not cur.fetchone():
        return None, 'Этот итог уже не отменить'
    _move(cur, item_id, row['warehouse'], 'Протирка', actor, 'remove')
    log_event(cur, actor, rid, 'undo', item_id, body.get('local_time'))
    return {'ok': True, 'counters': counters(cur, rid)}, None
