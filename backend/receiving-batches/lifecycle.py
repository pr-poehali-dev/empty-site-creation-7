"""Жизнь собранной партии: завершение с номером, «Забрать», «Разобрать», журнал, поиск."""
import re
import secrets

import psycopg2.errors

from batches import ITEM_COLS, get_batch, log, move_unit, put, touch, unit
from common import code_match, esc

CODE_RE = re.compile(r'^P(\d{6})$', re.I)
LINK_RE = re.compile(r'/b/([A-Za-z0-9_-]{10,})')


def batch_ref(code):
    """Код с наклейки партии: штрихкод P000123 или ссылка из QR."""
    code = (code or '').strip()
    m = CODE_RE.match(code)
    if m:
        return {'id': int(m.group(1))}
    m = LINK_RE.search(code)
    if m:
        return {'key': m.group(1)}
    return None


def _wh_of_items(cur, batch_id):
    cur.execute(
        f"SELECT i.warehouse, bi.kind FROM receiving_batch_items bi "
        f"JOIN receiving_items i ON i.id=bi.item_id "
        f"WHERE bi.batch_id={int(batch_id)} AND bi.active"
    )
    return [dict(r) for r in cur.fetchall()]


def summary(cur, batch):
    rows = _wh_of_items(cur, batch['id'])
    whs = sorted({r['warehouse'] for r in rows if r['warehouse']})
    return {
        'total': len(rows),
        'exact': sum(1 for r in rows if r['kind'] == 'exact'),
        'auto': sum(1 for r in rows if r['kind'] == 'auto'),
        'warehouses': whs,
        'mixed': bool(batch['mixed']) or len(whs) > 1,
    }


def act_finish(cur, actor, batch):
    if batch['status'] != 'draft':
        return {'error': 'Партия уже завершена'}
    s = summary(cur, batch)
    if s['total'] == 0:
        return {'error': 'В черновике нет товара'}
    mixed = s['mixed']
    wh = 'Смешанная' if mixed else (s['warehouses'][0] if s['warehouses'] else batch['warehouse'])
    # Номер за день общий для всех складов. От дублей защищает уникальный индекс
    # (day, seq): если два «Завершить» пришли разом, второй берёт следующий N.
    cur.execute("SELECT (now() AT TIME ZONE 'Europe/Moscow')::date AS d")
    day = cur.fetchone()['d']
    key = secrets.token_urlsafe(16)
    whs = 'NULL' if mixed else f"'{esc(wh)}'"
    number = None
    for _ in range(5):
        cur.execute(f"SELECT COALESCE(MAX(seq),0)+1 AS n FROM receiving_batches WHERE day='{day}'")
        seq = int(cur.fetchone()['n'])
        candidate = f"{day.strftime('%y%m%d')}/{seq}/{wh}"
        cur.execute("SAVEPOINT finish_try")
        try:
            cur.execute(
                f"UPDATE receiving_batches SET status='done', number='{esc(candidate)}', day='{day}', "
                f"seq={seq}, mixed={'true' if mixed else 'false'}, warehouse=COALESCE({whs}, warehouse), "
                f"public_key=COALESCE(public_key, '{key}'), finished_at=now(), "
                f"finished_by_name='{esc(actor['name'])}', updated_at=now() "
                f"WHERE id={int(batch['id'])} AND status='draft' RETURNING id"
            )
        except psycopg2.errors.UniqueViolation:
            cur.execute("ROLLBACK TO SAVEPOINT finish_try")
            continue
        updated = cur.fetchone()
        cur.execute("RELEASE SAVEPOINT finish_try")
        if not updated:
            return {'error': 'Не получилось завершить — обновите страницу'}
        number = candidate
        break
    if not number:
        return {'error': 'Номер занят — нажмите «Завершить» ещё раз'}
    log(cur, batch['id'], actor, 'finish', None,
        {'number': number, 'total': s['total'], 'auto': s['auto']})
    return {'ok': True, 'number': number}


def act_disband(cur, actor, batch):
    if batch['status'] != 'done':
        return {'error': 'Разобрать можно только собранную партию'}
    cur.execute(
        f"UPDATE receiving_batch_items SET active=false WHERE batch_id={int(batch['id'])} "
        f"AND active RETURNING item_id"
    )
    freed = len(cur.fetchall())
    cur.execute(
        f"UPDATE receiving_batches SET status='disbanded', closed_at=now(), "
        f"closed_by_name='{esc(actor['name'])}', updated_at=now() WHERE id={int(batch['id'])}"
    )
    log(cur, batch['id'], actor, 'disband', None, {'freed': freed})
    return {'ok': True, 'freed': freed}


def act_take_find(cur, batch, body):
    """Что забираем: по наклейке — точно, по заводскому коду — список единиц."""
    code = (body.get('code') or '').strip()
    if not code:
        return {'error': 'Пустой код'}
    e = esc(code)
    cur.execute(
        f"SELECT {ITEM_COLS}, bi.kind FROM receiving_batch_items bi "
        f"JOIN receiving_items i ON i.id=bi.item_id "
        f"WHERE bi.batch_id={int(batch['id'])} AND bi.active AND "
        f"(btrim(COALESCE(i.supplier_barcode,''))='{e}' OR btrim(COALESCE(i.order_number,''))='{e}') "
        f"LIMIT 1"
    )
    r = cur.fetchone()
    if r:
        return {'ok': True, 'rows': [dict(r)], 'exact': True}
    cur.execute(
        f"SELECT {ITEM_COLS}, bi.kind FROM receiving_batch_items bi "
        f"JOIN receiving_items i ON i.id=bi.item_id "
        f"WHERE bi.batch_id={int(batch['id'])} AND bi.active AND i.id IN "
        f"(SELECT id FROM receiving_items WHERE {code_match(code)}) "
        f"ORDER BY (bi.kind='auto') DESC, bi.added_at DESC"
    )
    rows = [dict(x) for x in cur.fetchall()]
    if not rows:
        return {'error': 'Такого товара в этой партии нет'}
    return {'ok': True, 'rows': rows, 'exact': False}


def _my_draft(cur, actor):
    cur.execute(
        f"INSERT INTO receiving_batches (status, created_by_user, created_by_name) "
        f"VALUES ('draft', {actor['user_id']}, '{esc(actor['name'])}') "
        f"ON CONFLICT (created_by_user) WHERE status='draft' DO NOTHING RETURNING id"
    )
    r = cur.fetchone()
    if r:
        log(cur, r['id'], actor, 'create')
        return get_batch(cur, r['id'], lock=True), True
    cur.execute(
        f"SELECT id FROM receiving_batches WHERE created_by_user={actor['user_id']} "
        f"AND status='draft' LIMIT 1"
    )
    return get_batch(cur, cur.fetchone()['id'], lock=True), False


def act_take(cur, actor, batch, body, allowed):
    ids = [int(i) for i in (body.get('item_ids') or []) if str(i).isdigit()][:500]
    dest = body.get('dest') or ''
    if not ids:
        return {'error': 'Не выбрано, что забрать'}
    if dest not in ('draft', 'move'):
        return {'error': 'Не выбрано, куда забрать'}
    target = (body.get('warehouse_to') or '').strip()
    if dest == 'move' and target not in allowed:
        return {'error': 'Этот склад вам не открыт'}

    id_list = ','.join(str(i) for i in ids)
    cur.execute(
        f"UPDATE receiving_batch_items SET active=false WHERE batch_id={int(batch['id'])} "
        f"AND item_id IN ({id_list}) AND active RETURNING item_id, kind"
    )
    taken = [(int(r['item_id']), r['kind']) for r in cur.fetchall()]
    if not taken:
        return {'error': 'Этих единиц в партии уже нет'}

    if dest == 'move':
        moved = 0
        for item_id, _ in taken:
            u = unit(cur, item_id)
            if u['warehouse'] and u['warehouse'] not in allowed:
                return {'error': f"Склад «{u['warehouse']}» вам не открыт"}
            if u['warehouse'] != target:
                move_unit(cur, actor, item_id, u['warehouse'], target)
                moved += 1
            log(cur, batch['id'], actor, 'take', item_id, {'dest': 'move', 'to': target})
        touch(cur, batch['id'])
        return {'ok': True, 'taken': len(taken), 'moved': moved, 'warehouse_to': target}

    draft, created = _my_draft(cur, actor)
    draft = dict(draft)
    mixed_now = False
    for item_id, kind in taken:
        u = unit(cur, item_id)
        if not draft['warehouse']:
            cur.execute(f"UPDATE receiving_batches SET warehouse='{esc(u['warehouse'])}' WHERE id={draft['id']}")
            draft['warehouse'] = u['warehouse']
        elif not draft['mixed'] and draft['warehouse'] != u['warehouse']:
            cur.execute(f"UPDATE receiving_batches SET mixed=true WHERE id={draft['id']}")
            draft['mixed'] = True
            mixed_now = True
        if not put(cur, draft['id'], item_id, kind, actor):
            return {'error': 'Единицу только что взяли — попробуйте ещё раз'}
        log(cur, batch['id'], actor, 'take', item_id, {'dest': 'draft', 'to_batch': draft['id']})
        log(cur, draft['id'], actor, 'add', item_id, {'kind': kind, 'from_batch': batch['id']})
    touch(cur, batch['id'])
    touch(cur, draft['id'])
    return {'ok': True, 'taken': len(taken), 'draft_id': int(draft['id']),
            'draft_created': created, 'draft_mixed': mixed_now}


ACTIONS = {
    'create': 'Создан черновик', 'add': 'Добавлена', 'remove': 'Убрана', 'confirm': 'Подтверждена по наклейке',
    'swapped_out': 'Забрана в другую партию, подставлена замена', 'move': 'Перемещена на склад партии',
    'mixed': 'Партия стала смешанной', 'meta': 'Изменены реквизиты', 'delete': 'Черновик удалён',
    'finish': 'Партия завершена', 'take': 'Забрана из партии', 'disband': 'Партия разобрана',
}


def act_log(cur, batch):
    cur.execute(
        f"SELECT l.id, l.action, l.item_id, l.details, l.by_name, l.at, i.tech_name, i.supplier_barcode "
        f"FROM receiving_batch_log l LEFT JOIN receiving_items i ON i.id=l.item_id "
        f"WHERE l.batch_id={int(batch['id'])} ORDER BY l.at DESC, l.id DESC LIMIT 500"
    )
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r['title'] = ACTIONS.get(r['action'], r['action'])
    return {'rows': rows}


def act_find(cur, params):
    """Пик штрихкода/QR партии или ввод номера в поиске «Складов»."""
    q = (params.get('q') or '').strip()
    if not q:
        return {'found': False}
    ref = batch_ref(q)
    if ref and 'id' in ref:
        where = f"id={ref['id']}"
    elif ref:
        where = f"public_key='{esc(ref['key'])}'"
    elif '/' in q:
        where = f"lower(number)=lower('{esc(q)}')"
    else:
        return {'found': False}
    cur.execute(f"SELECT id, number, status FROM receiving_batches WHERE {where} AND status<>'deleted' LIMIT 1")
    r = cur.fetchone()
    return {'found': True, 'id': int(r['id']), 'number': r['number']} if r else {'found': False}
