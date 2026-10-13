"""Режим «Исправление ошибки»: новый итог по уже обработанной единице.

Исправлять можно только свои итоги, владелец — любые. Товар остаётся в своей
приёмке (в том числе закрытой), её счётчики пересчитываются. Каждое исправление —
отдельная запись в receiving_fixes: кто, когда, что было, что стало.
Мастер, исправляя товар после протирки, итог протирки не снимает.
"""
from worklog import local_sql, log_event

WAREHOUSES = {'sale': 'СГП', 'wipe': 'Протирка', 'repair': 'Под ремонт', 'scrap': 'Утиль'}


def _esc(s):
    return str(s).replace("'", "''")


def can_fix_check(actor, item):
    if actor['is_owner']:
        return True
    return bool(actor.get('manager_id')) and item.get('checked_by') == actor['manager_id']


def can_fix_wipe(actor, item):
    if actor['is_owner']:
        return True
    return bool(actor.get('manager_id')) and item.get('wipe_by') == actor['manager_id']


def _record(cur, actor, item_id, stage, was, became, rid, local_time):
    mid = int(actor['manager_id']) if actor.get('manager_id') else 'NULL'
    cur.execute(
        f"INSERT INTO receiving_fixes (item_id, stage, was, became, receiving_id, fixed_by, fixed_by_name, local_ts) "
        f"VALUES ({int(item_id)}, '{stage}', '{_esc(was or '')}', '{_esc(became or '')}', "
        f"{int(rid) if rid else 'NULL'}, {mid}, '{_esc(actor['name'])}', {local_sql(local_time)})"
    )


def _move(cur, item_id, wh_from, wh_to, actor, source):
    src = 'NULL' if not wh_from else f"'{_esc(wh_from)}'"
    mid = int(actor['manager_id']) if actor.get('manager_id') else 'NULL'
    cur.execute(
        f"INSERT INTO receiving_moves (item_id, warehouse_from, warehouse_to, moved_by, moved_by_name, source) "
        f"VALUES ({int(item_id)}, {src}, '{_esc(wh_to)}', {mid}, '{_esc(actor['name'])}', '{source}')"
    )


def _open_own(cur, rid, owner_filter):
    cur.execute(f"SELECT id, kind, closed FROM daily_receivings WHERE id={int(rid)} AND {owner_filter} LIMIT 1")
    row = cur.fetchone()
    if not row or row['closed']:
        return None
    return row


def act_fix_check(cur, cols, actor, owner_filter, body, pick_weight):
    rid = int(body.get('receiving_id') or 0)
    item_id = int(body.get('item_id') or 0)
    outcome = body.get('outcome') or ''
    if outcome not in WAREHOUSES:
        return None, 'Неизвестный исход'
    cur_rec = _open_own(cur, rid, owner_filter)
    if not cur_rec:
        return None, 'Приёмка закрыта или чужая'
    if cur_rec['kind'] == 'kind_plain':
        return None, 'В протирке итог мастера не исправить'
    cur.execute(f"SELECT {cols}, checked_by, wipe_by FROM receiving_items WHERE id={item_id} LIMIT 1")
    item = cur.fetchone()
    if not item:
        return None, 'Единица не найдена'
    item = dict(item)
    if not item.get('check_result'):
        return None, 'Товар ещё не проверен — исправлять нечего'
    if not can_fix_check(actor, item):
        return None, 'Исправлять можно только свои итоги'

    sets = [
        f"check_result='{outcome}'",
        f"fixed_at=now()",
        f"fixed_local={local_sql(body.get('local_time'))}",
        f"fixed_by_name='{_esc(actor['name'])}'",
    ]
    # Протирка уже сделала своё — склад остаётся за ней, решение мастера меняется.
    new_wh = item.get('warehouse') if item.get('wipe_result') else WAREHOUSES[outcome]
    sets.append(f"warehouse='{_esc(new_wh)}'")
    hp = body.get('has_package')
    if hp is not None:
        w = pick_weight(item, bool(hp))
        sets.append(f"has_package={'true' if hp else 'false'}")
        sets.append(f"invoice_weight={'NULL' if w is None else w}")
    if outcome == 'repair':
        nd = bool(body.get('new_defect'))
        text = (body.get('new_defect_text') or '').strip() if nd else ''
        sets.append(f"defect_confirmed={'true' if body.get('defect_confirmed') else 'false'}")
        sets.append(f"new_defect={'true' if nd else 'false'}")
        sets.append(f"new_defect_text='{_esc(text)}'" if text else 'new_defect_text=NULL')
    else:
        sets += ['defect_confirmed=NULL', 'new_defect=NULL', 'new_defect_text=NULL']
    cur.execute(f"UPDATE receiving_items SET {', '.join(sets)} WHERE id={item_id} RETURNING id")
    if not cur.fetchone():
        return None, 'Не удалось исправить'
    _record(cur, actor, item_id, 'check', item['check_result'], outcome, item.get('daily_receiving_id'), body.get('local_time'))
    if new_wh != item.get('warehouse'):
        _move(cur, item_id, item.get('warehouse'), new_wh, actor, 'fixcheck')
    log_event(cur, actor, rid, 'fix_result', item_id, body.get('local_time'))
    return {'ok': True, 'warehouse': new_wh}, None


def act_fix_wipe(cur, cols, actor, owner_filter, body):
    rid = int(body.get('receiving_id') or 0)
    item_id = int(body.get('item_id') or 0)
    result = body.get('result') or ''
    look = body.get('look') or ''
    traces = body.get('traces') or ''
    if result not in ('sale', 'scrap'):
        return None, 'Неизвестный итог'
    if result == 'sale' and (look not in ('new', 'excellent', 'good') or traces not in ('none', 'used')):
        return None, 'Выберите внешний вид и следы'
    cur_rec = _open_own(cur, rid, owner_filter)
    if not cur_rec or cur_rec['kind'] != 'kind_plain':
        return None, 'Приёмка протирки закрыта или чужая'
    cur.execute(f"SELECT {cols}, checked_by, wipe_by FROM receiving_items WHERE id={item_id} LIMIT 1")
    item = cur.fetchone()
    if not item:
        return None, 'Единица не найдена'
    item = dict(item)
    if not item.get('wipe_result'):
        return None, 'Протирка этот товар ещё не обрабатывала'
    if not can_fix_wipe(actor, item):
        return None, 'Исправлять можно только свои итоги'
    wh = 'СГП' if result == 'sale' else 'Утиль'
    lk = f"'{look}'" if result == 'sale' else 'NULL'
    tr = f"'{traces}'" if result == 'sale' else 'NULL'
    cur.execute(
        f"UPDATE receiving_items SET wipe_result='{result}', wipe_look={lk}, wipe_traces={tr}, "
        f"wipe_fixed_at=now(), warehouse='{wh}' WHERE id={item_id} RETURNING id"
    )
    if not cur.fetchone():
        return None, 'Не удалось исправить'
    was = '/'.join(x for x in [item['wipe_result'], item.get('wipe_look') or '', item.get('wipe_traces') or ''] if x)
    became = '/'.join(x for x in [result, look if result == 'sale' else '', traces if result == 'sale' else ''] if x)
    _record(cur, actor, item_id, 'wipe', was, became, item.get('wipe_receiving_id'), body.get('local_time'))
    if wh != item.get('warehouse'):
        _move(cur, item_id, item.get('warehouse'), wh, actor, 'wipefix')
    log_event(cur, actor, rid, 'fix_result', item_id, body.get('local_time'))
    return {'ok': True}, None


def act_fix_mode(cur, actor, owner_filter, body):
    rid = int(body.get('receiving_id') or 0)
    on = bool(body.get('on'))
    if not _open_own(cur, rid, owner_filter):
        return None, 'Приёмка закрыта или чужая'
    log_event(cur, actor, rid, 'fix_on' if on else 'fix_off', None, body.get('local_time'))
    return {'ok': True}, None


def fix_summary(cur, rid):
    """Исправлений в приёмке и время в режиме: от включения до выключения
    (не выключили — до последнего события режима)."""
    cur.execute(
        f"SELECT event, local_ts, server_ts FROM receiving_work_events "
        f"WHERE receiving_id={int(rid)} AND event IN ('fix_on','fix_off','fix_scan','fix_result') ORDER BY id"
    )
    count, sec, start, last = 0, 0, None, None
    for r in cur.fetchall():
        t = r['local_ts'] or r['server_ts'].replace(tzinfo=None)
        if r['event'] == 'fix_result':
            count += 1
        if r['event'] == 'fix_on':
            start = t
        elif start is not None:
            last = t
            if r['event'] == 'fix_off':
                sec += max(0, int((t - start).total_seconds()))
                start, last = None, None
    if start is not None and last is not None:
        sec += max(0, int((last - start).total_seconds()))
    return count, sec
