"""Лента рабочего времени сотрудника в приёмке.

События: start — нажал «НАЧАТЬ», scan — взял единицу (скан или выбор вручную),
result — выбрал итог, undo — итог отменён или единица убрана, end — «Закончить».
Время берём с телефона (local_ts), серверное пишется рядом как запасное:
сбитые часы на телефоне видно по расхождению.
"""
import re

EVENTS = ('start', 'scan', 'result', 'undo', 'end', 'fix_on', 'fix_off', 'fix_scan', 'fix_result')


def _esc(s):
    return str(s).replace("'", "''")


def local_sql(v):
    m = re.match(r'^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(:\d{2})?)$', str(v or '').strip())
    return f"'{m.group(1)} {m.group(2)}'" if m else 'NULL'


def log_event(cur, actor, receiving_id, event, item_id=None, local_time=None):
    if event not in EVENTS or not receiving_id:
        return
    mid = int(actor['manager_id']) if actor.get('manager_id') else 'NULL'
    iid = int(item_id) if item_id else 'NULL'
    cur.execute(
        f"INSERT INTO receiving_work_events "
        f"(receiving_id, manager_id, employee_name, event, item_id, local_ts) "
        f"VALUES ({int(receiving_id)}, {mid}, '{_esc(actor['name'])}', '{event}', "
        f"{iid}, {local_sql(local_time)})"
    )


def _ts(row, other):
    """Обе метки с телефона — считаем по телефону, иначе по серверу."""
    if row['local_ts'] and other['local_ts']:
        return row['local_ts'], other['local_ts']
    a, b = row['server_ts'], other['server_ts']
    return a.replace(tzinfo=None), b.replace(tzinfo=None)


def work_seconds(cur, receiving_id, item_ids):
    """Время работы над единицей: от последнего скана до итога в этой приёмке.
    Отмена итога обнуляет попытку — её время в работу не идёт."""
    if not item_ids:
        return {}
    joined = ','.join(str(int(i)) for i in item_ids)
    cur.execute(
        f"SELECT item_id, event, local_ts, server_ts FROM receiving_work_events "
        f"WHERE receiving_id={int(receiving_id)} AND item_id IN ({joined}) ORDER BY id"
    )
    scan, out = {}, {}
    for r in cur.fetchall():
        iid = int(r['item_id'])
        if r['event'] == 'scan':
            scan[iid] = r
        elif r['event'] == 'result' and iid in scan:
            end, start = _ts(r, scan[iid])
            sec = int((end - start).total_seconds())
            if sec >= 0:
                out[iid] = sec
        elif r['event'] == 'undo':
            scan.pop(iid, None)
            out.pop(iid, None)
    return out


def last_results(cur, receiving_ids):
    """Время последнего итога с телефона — конец приёмки, если «Закончить» не нажали."""
    if not receiving_ids:
        return {}
    joined = ','.join(str(int(i)) for i in receiving_ids)
    cur.execute(
        f"SELECT receiving_id AS rid, MAX(local_ts) AS t FROM receiving_work_events "
        f"WHERE receiving_id IN ({joined}) AND event='result' GROUP BY 1"
    )
    return {int(r['rid']): r['t'] for r in cur.fetchall() if r['t']}


