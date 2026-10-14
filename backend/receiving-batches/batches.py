"""Черновик партии: добавление по наклейке/заказ-наряду (точно) и по заводскому коду
(подставляется свободная единица), бронь и подмена, удаление, журнал."""
import json

from common import (
    FB, FREE, NAME_SQL, PB, PG, PM, code_match, esc, pos_where,
)

I_NAME = (
    "btrim(COALESCE(i.product_group,'') || ' ' || COALESCE(i.brand,'') || ' ' || COALESCE(i.model,''))"
)
ITEM_COLS = (
    f"i.id, regexp_replace({I_NAME}, '\\s+', ' ', 'g') AS name, "
    "i.tech_name, i.supplier_barcode, i.order_number, i.warehouse, "
    "btrim(COALESCE(i.product_group,'')) AS product_group, btrim(COALESCE(i.brand,'')) AS brand, "
    "btrim(COALESCE(i.model,'')) AS model"
)


def log(cur, batch_id, actor, action, item_id=None, details=None):
    d = f"'{esc(json.dumps(details, ensure_ascii=False))}'::jsonb" if details is not None else 'NULL'
    iid = int(item_id) if item_id else 'NULL'
    cur.execute(
        f"INSERT INTO receiving_batch_log (batch_id, action, item_id, details, by_user, by_name) "
        f"VALUES ({int(batch_id)}, '{esc(action)}', {iid}, {d}, {int(actor['user_id'])}, "
        f"'{esc(actor['name'])}')"
    )


def holder_text(b):
    if b['status'] == 'draft':
        return f"в черновике у {b['created_by_name'] or 'сотрудника'}"
    return f"в партии №{b['number'] or b['id']}"


def get_batch(cur, batch_id, lock=False):
    cur.execute(
        f"SELECT * FROM receiving_batches WHERE id={int(batch_id)} LIMIT 1"
        + (" FOR UPDATE" if lock else "")
    )
    return cur.fetchone()


def unit(cur, item_id):
    cur.execute(
        f"SELECT {ITEM_COLS} FROM receiving_items i WHERE i.id={int(item_id)} LIMIT 1"
    )
    return cur.fetchone()


def holding(cur, item_id):
    """Где сейчас стоит единица: строка состава + партия."""
    cur.execute(
        f"SELECT bi.id AS row_id, bi.kind, bi.batch_id, b.status, b.number, b.created_by_name, b.id "
        f"FROM receiving_batch_items bi JOIN receiving_batches b ON b.id=bi.batch_id "
        f"WHERE bi.item_id={int(item_id)} AND bi.active LIMIT 1"
    )
    return cur.fetchone()


def free_unit(cur, pos, warehouse, exclude_id=0):
    cur.execute(
        f"SELECT id FROM receiving_items WHERE {pos_where(pos)} "
        f"AND warehouse='{esc(warehouse)}' AND id<>{int(exclude_id)} AND {FREE} "
        f"ORDER BY checked_at NULLS LAST, id LIMIT 1"
    )
    r = cur.fetchone()
    return int(r['id']) if r else None


def put(cur, batch_id, item_id, kind, actor):
    cur.execute(
        f"INSERT INTO receiving_batch_items (batch_id, item_id, kind, added_by_name) "
        f"VALUES ({int(batch_id)}, {int(item_id)}, '{esc(kind)}', '{esc(actor['name'])}') "
        f"ON CONFLICT (item_id) WHERE active DO NOTHING RETURNING id"
    )
    return cur.fetchone() is not None


def move_unit(cur, actor, item_id, src, dst):
    cur.execute(
        f"UPDATE receiving_items SET warehouse='{esc(dst)}' WHERE id={int(item_id)}"
    )
    mid = int(actor['manager_id']) if actor['manager_id'] else 'NULL'
    cur.execute(
        f"INSERT INTO receiving_moves (item_id, warehouse_from, warehouse_to, moved_by, moved_by_name, source) "
        f"VALUES ({int(item_id)}, '{esc(src)}', '{esc(dst)}', {mid}, '{esc(actor['name'])}', 'batch')"
    )


def touch(cur, batch_id):
    cur.execute(f"UPDATE receiving_batches SET updated_at=now() WHERE id={int(batch_id)}")


def warehouse_gate(cur, batch, wh, on_other, allowed):
    """Склад партии задаёт первый товар. Чужой склад в несмешанной партии —
    решает человек: пропустить, переместить или сделать партию смешанной."""
    if not batch['warehouse']:
        cur.execute(
            f"UPDATE receiving_batches SET warehouse='{esc(wh)}' WHERE id={int(batch['id'])}"
        )
        batch['warehouse'] = wh
        return None, None
    if batch['mixed'] or batch['warehouse'] == wh:
        return None, None
    can_mix = batch['status'] == 'draft'
    if on_other == 'mix' and not can_mix:
        return None, {'error': f"У партии уже номер со складом «{batch['warehouse']}» — "
                               f"смешать нельзя, можно только переместить товар"}
    if on_other == 'mix':
        cur.execute(f"UPDATE receiving_batches SET mixed=true WHERE id={int(batch['id'])}")
        batch['mixed'] = True
        return 'mixed', None
    if on_other == 'move':
        if wh not in allowed or batch['warehouse'] not in allowed:
            return None, {'error': 'Перемещать между этими складами вам нельзя'}
        return 'move', None
    return None, {
        'need': 'other_wh',
        'from_wh': wh,
        'batch_wh': batch['warehouse'],
        'can_move': wh in allowed and batch['warehouse'] in allowed,
        'can_mix': can_mix,
    }


def _exact(cur, code):
    e = esc(code)
    cur.execute(
        f"SELECT id FROM receiving_items WHERE btrim(COALESCE(supplier_barcode,''))='{e}' "
        f"OR btrim(COALESCE(order_number,''))='{e}' ORDER BY id LIMIT 1"
    )
    r = cur.fetchone()
    return int(r['id']) if r else None


def scan_exact(cur, actor, batch, item_id, on_other, allowed):
    u = unit(cur, item_id)
    if not u['warehouse']:
        return {'error': 'Этот товар ещё не прошёл приёмку — его нет на складах'}
    h = holding(cur, item_id)
    if h and h['batch_id'] == batch['id']:
        if h['kind'] == 'exact':
            return {'error': 'Эта единица уже в партии', 'flash': item_id}
        cur.execute(f"UPDATE receiving_batch_items SET kind='exact' WHERE id={int(h['row_id'])}")
        log(cur, batch['id'], actor, 'confirm', item_id)
        return {'ok': True, 'flash': item_id, 'message': 'Подтверждена по наклейке'}
    if h and h['kind'] == 'exact':
        return {'error': f"Эта единица уже {holder_text(h)}"}

    replacement = None
    if h:
        replacement = free_unit(cur, u, u['warehouse'], item_id)
        if not replacement:
            return {
                'error': f"Последняя единица, она {holder_text(h)}. "
                         f"Если она у вас в руках — на складах пересорт",
                'investigate': True,
            }

    gate, stop = warehouse_gate(cur, batch, u['warehouse'], on_other, allowed)
    if stop:
        return stop

    if h:
        cur.execute(f"UPDATE receiving_batch_items SET active=false WHERE id={int(h['row_id'])}")
        if not put(cur, h['batch_id'], replacement, 'auto', actor):
            return {'error': 'Единицу только что взяли — пикните ещё раз'}
        log(cur, h['batch_id'], actor, 'swapped_out', item_id,
            {'to_batch': batch['id'], 'replacement': replacement})
        touch(cur, h['batch_id'])

    if gate == 'move':
        move_unit(cur, actor, item_id, u['warehouse'], batch['warehouse'])
        log(cur, batch['id'], actor, 'move', item_id,
            {'from': u['warehouse'], 'to': batch['warehouse']})
    if gate == 'mixed':
        log(cur, batch['id'], actor, 'mixed', item_id)

    if not put(cur, batch['id'], item_id, 'exact', actor):
        return {'error': 'Единицу только что взяли — пикните ещё раз'}
    log(cur, batch['id'], actor, 'add', item_id,
        {'kind': 'exact', 'swap_from': h['batch_id'] if h else None})
    msg = f"Единица была {holder_text(h)} — туда подставлена другая" if h else None
    return {'ok': True, 'flash': item_id, 'message': msg}


def scan_factory(cur, actor, batch, code, params, allowed):
    cur.execute(
        f"SELECT {PG} AS product_group, {PB} AS brand, {PM} AS model, "
        f"MIN({NAME_SQL}) AS name, COUNT(*) FILTER (WHERE warehouse IS NOT NULL AND {FREE}) AS free "
        f"FROM receiving_items WHERE {code_match(code)} GROUP BY 1,2,3"
    )
    positions = [dict(r) for r in cur.fetchall()]
    if not positions:
        return {'need': 'unknown_code', 'code': code}

    want = params.get('position') or None
    if want:
        positions = [p for p in positions if p['product_group'] == want.get('product_group')
                     and p['brand'] == want.get('brand') and p['model'] == want.get('model')]
        if not positions:
            return {'error': 'Товар не найден'}
    with_free = [p for p in positions if int(p['free'] or 0) > 0]
    if not with_free:
        return {'error': 'Свободных единиц этого товара на складах нет — все уже в партиях или не приняты'}
    if len(with_free) > 1:
        return {
            'need': 'pick_position',
            'positions': [{k: p[k] for k in ('product_group', 'brand', 'model', 'name')}
                          | {'free': int(p['free'])} for p in with_free],
        }
    pos = with_free[0]

    cur.execute(
        f"SELECT warehouse, COUNT(*) AS n FROM receiving_items WHERE {pos_where(pos)} "
        f"AND warehouse IS NOT NULL AND {FREE} GROUP BY 1 ORDER BY 2 DESC"
    )
    stock = [{'name': r['warehouse'], 'free': int(r['n'])} for r in cur.fetchall()]
    names = [s['name'] for s in stock]
    pos_out = {k: pos[k] for k in ('product_group', 'brand', 'model', 'name')}

    wh = (params.get('warehouse') or '').strip()
    if wh and wh not in names:
        return {'error': f"На складе «{wh}» свободных единиц этого товара нет"}
    if not wh:
        if batch['warehouse'] and not batch['mixed'] and batch['warehouse'] in names:
            wh = batch['warehouse']
        elif len(names) == 1:
            wh = names[0]
        elif batch['warehouse'] and not batch['mixed'] and params.get('on_other') not in ('mix', 'move'):
            return {'need': 'other_wh', 'from_wh': None, 'batch_wh': batch['warehouse'],
                    'can_move': batch['warehouse'] in allowed, 'stock': stock,
                    'can_mix': batch['status'] == 'draft',
                    'allowed': allowed, 'position': pos_out}
        else:
            return {'need': 'pick_warehouse', 'stock': stock, 'position': pos_out, 'allowed': allowed}

    item_id = free_unit(cur, pos, wh)
    if not item_id:
        return {'error': 'Единицу только что взяли — пикните ещё раз'}

    gate, stop = warehouse_gate(cur, batch, wh, params.get('on_other'), allowed)
    if stop:
        if stop.get('need') == 'other_wh':
            stop['position'] = pos_out
            stop['stock'] = stock
            stop['allowed'] = allowed
        return stop
    if gate == 'move':
        move_unit(cur, actor, item_id, wh, batch['warehouse'])
        log(cur, batch['id'], actor, 'move', item_id, {'from': wh, 'to': batch['warehouse']})
    if gate == 'mixed':
        log(cur, batch['id'], actor, 'mixed', item_id)
    if not put(cur, batch['id'], item_id, 'auto', actor):
        return {'error': 'Единицу только что взяли — пикните ещё раз'}
    log(cur, batch['id'], actor, 'add', item_id, {'kind': 'auto', 'code': code})
    return {'ok': True, 'flash': item_id}


def act_scan(cur, actor, batch, body, allowed):
    code = (body.get('code') or '').strip()
    if not code:
        return {'error': 'Пустой код'}
    item_id = _exact(cur, code)
    if item_id:
        res = scan_exact(cur, actor, batch, item_id, body.get('on_other'), allowed)
    else:
        res = scan_factory(cur, actor, batch, code, body, allowed)
    if res.get('ok'):
        touch(cur, batch['id'])
    return res


def act_remove_scan(cur, actor, batch, body):
    code = (body.get('code') or '').strip()
    if not code:
        return {'error': 'Пустой код'}
    item_id = _exact(cur, code)
    if item_id:
        cur.execute(
            f"UPDATE receiving_batch_items SET active=false WHERE batch_id={int(batch['id'])} "
            f"AND item_id={item_id} AND active RETURNING id"
        )
        if not cur.fetchone():
            return {'error': 'Этой единицы в партии нет'}
        log(cur, batch['id'], actor, 'remove', item_id, {'by': 'exact'})
        touch(cur, batch['id'])
        return {'ok': True, 'removed': item_id}
    cur.execute(
        f"SELECT {ITEM_COLS}, bi.kind, bi.added_at FROM receiving_batch_items bi "
        f"JOIN receiving_items i ON i.id=bi.item_id "
        f"WHERE bi.batch_id={int(batch['id'])} AND bi.active AND i.id IN "
        f"(SELECT id FROM receiving_items WHERE {code_match(code)}) "
        f"ORDER BY (bi.kind='auto') DESC, bi.added_at DESC"
    )
    rows = [dict(r) for r in cur.fetchall()]
    if not rows:
        return {'error': 'Такого товара в партии нет'}
    return {'need': 'pick_remove', 'rows': rows}


def act_remove_item(cur, actor, batch, body):
    item_id = int(body.get('item_id') or 0)
    cur.execute(
        f"UPDATE receiving_batch_items SET active=false WHERE batch_id={int(batch['id'])} "
        f"AND item_id={item_id} AND active RETURNING id"
    )
    if not cur.fetchone():
        return {'error': 'Этой единицы в партии уже нет'}
    log(cur, batch['id'], actor, 'remove', item_id, {'by': 'list'})
    touch(cur, batch['id'])
    return {'ok': True, 'removed': item_id}


def view(cur, batch):
    cur.execute(
        f"SELECT {ITEM_COLS}, bi.kind, bi.added_at, bi.added_by_name "
        f"FROM receiving_batch_items bi JOIN receiving_items i ON i.id=bi.item_id "
        f"WHERE bi.batch_id={int(batch['id'])} AND bi.active ORDER BY bi.added_at DESC, bi.id DESC"
    )
    items = [dict(r) for r in cur.fetchall()]
    cp = None
    if batch['counterparty_id']:
        cur.execute(
            f"SELECT id, name, inn FROM receiving_counterparties "
            f"WHERE id={int(batch['counterparty_id'])} LIMIT 1"
        )
        r = cur.fetchone()
        cp = dict(r) if r else None
    out = {k: batch[k] for k in (
        'id', 'number', 'status', 'warehouse', 'mixed', 'comment', 'created_by_name',
        'created_by_user', 'created_at', 'updated_at', 'public_key', 'finished_at',
        'finished_by_name', 'closed_at', 'closed_by_name',
    )}
    out['code'] = f"P{int(batch['id']):06d}"
    out['counterparty'] = cp
    return {'batch': out, 'items': items}