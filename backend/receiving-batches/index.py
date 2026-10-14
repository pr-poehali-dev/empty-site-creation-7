import json

from psycopg2.extras import RealDictCursor

import batches as B
import lifecycle as L
from common import allowed_warehouses, can, conn, esc, perms_of, who

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json', **CORS},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def act_list(cur):
    cur.execute(
        "SELECT b.id, b.number, b.status, b.warehouse, b.mixed, b.created_by_name, "
        "b.created_by_user, b.created_at, b.updated_at, cp.name AS counterparty, "
        "(SELECT COUNT(*) FROM receiving_batch_items bi WHERE bi.batch_id=b.id AND bi.active) AS qty "
        "FROM receiving_batches b LEFT JOIN receiving_counterparties cp ON cp.id=b.counterparty_id "
        "WHERE b.status<>'deleted' "
        "ORDER BY (b.status='draft') DESC, b.updated_at DESC LIMIT 300"
    )
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r['qty'] = int(r['qty'])
    return {
        'drafts': [r for r in rows if r['status'] == 'draft'],
        'batches': [r for r in rows if r['status'] != 'draft'],
    }


def act_new(cur, actor):
    """У сотрудника один черновик: есть — отдаём его, нет — создаём."""
    cur.execute(
        f"INSERT INTO receiving_batches (status, created_by_user, created_by_name) "
        f"VALUES ('draft', {actor['user_id']}, '{esc(actor['name'])}') "
        f"ON CONFLICT (created_by_user) WHERE status='draft' DO NOTHING RETURNING id"
    )
    r = cur.fetchone()
    if r:
        B.log(cur, r['id'], actor, 'create')
        return {'id': int(r['id']), 'created': True}
    cur.execute(
        f"SELECT id FROM receiving_batches WHERE created_by_user={actor['user_id']} "
        f"AND status='draft' LIMIT 1"
    )
    return {'id': int(cur.fetchone()['id']), 'created': False}


def act_meta(cur, actor, batch, body):
    sets = []
    if 'comment' in body:
        c = (body.get('comment') or '').strip()[:2000]
        sets.append(f"comment={chr(39) + esc(c) + chr(39) if c else 'NULL'}")
    if 'counterparty_id' in body:
        cid = int(body.get('counterparty_id') or 0)
        if cid:
            cur.execute(f"SELECT id FROM receiving_counterparties WHERE id={cid} LIMIT 1")
            if not cur.fetchone():
                return {'error': 'Контрагент не найден'}
        sets.append(f"counterparty_id={cid or 'NULL'}")
    if not sets:
        return {'ok': True}
    cur.execute(
        f"UPDATE receiving_batches SET {', '.join(sets)}, updated_at=now() WHERE id={int(batch['id'])}"
    )
    B.log(cur, batch['id'], actor, 'meta', None,
          {k: body.get(k) for k in ('comment', 'counterparty_id') if k in body})
    return {'ok': True}


def act_delete(cur, actor, batch):
    if batch['status'] != 'draft':
        return {'error': 'Удалить можно только черновик'}
    cur.execute(
        f"UPDATE receiving_batch_items SET active=false WHERE batch_id={int(batch['id'])} "
        f"AND active RETURNING item_id"
    )
    freed = len(cur.fetchall())
    cur.execute(
        f"UPDATE receiving_batches SET status='deleted', updated_at=now() WHERE id={int(batch['id'])}"
    )
    B.log(cur, batch['id'], actor, 'delete', None, {'freed': freed})
    return {'ok': True, 'freed': freed}


def handler(event: dict, context) -> dict:
    """Партии складов приёмки: список черновиков и партий, один черновик на сотрудника, добавление товара по наклейке поставщика/заказ-наряду (точно) или по заводскому коду (подставляется свободная единица), выбор склада, смешанная партия, перемещение на склад партии, бронь и подмена единиц, удаление из черновика, контрагент и комментарий, удаление черновика, завершение с номером ГГММДД/N/Склад, «Забрать» из собранной партии (в черновик или на склад), разборка партии, журнал, поиск партии по коду, QR или номеру."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'receiving-batches'})

    body = {}
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        action = body.get('action', action)

    c = conn()
    try:
        cur = c.cursor(cursor_factory=RealDictCursor)
        actor = who(cur, token)
        if not actor:
            return _resp(401, {'error': 'Войдите заново'})
        perms = perms_of(cur, actor)
        can_see = can(actor, perms, 'docs_batches_see') or can(actor, perms, 'docs_batches_build')
        can_build = can(actor, perms, 'docs_batches_build')

        can_change = can(actor, perms, 'docs_batches_change')
        can_disband = can(actor, perms, 'docs_batches_disband')
        can_print = can(actor, perms, 'docs_batches_print')

        if action == 'meta':
            return _resp(200, {'can_see': can_see, 'can_build': can_build,
                               'can_change': can_change, 'can_disband': can_disband,
                               'can_print': can_print,
                               'user_id': actor['user_id'], 'is_owner': actor['is_owner']})
        if not can_see:
            return _resp(403, {'error': 'Партии вам не открыты'})

        if action == 'list':
            return _resp(200, act_list(cur))

        if action == 'find':
            return _resp(200, L.act_find(cur, params))

        if action == 'new':
            if not can_build:
                return _resp(403, {'error': 'Нет права собирать партии'})
            res = act_new(cur, actor)
            c.commit()
            return _resp(200, res)

        bid = int(params.get('id') or body.get('id') or 0)
        batch = B.get_batch(cur, bid, lock=method == 'POST')
        if not batch or batch['status'] == 'deleted':
            return _resp(404, {'error': 'Партия не найдена'})
        batch = dict(batch)

        mine = actor['is_owner'] or batch['created_by_user'] == actor['user_id']
        st = batch['status']
        edit_draft = st == 'draft' and can_build and mine
        edit_done = st == 'done' and (mine or can_change)
        rights = {
            'can_edit': edit_draft or edit_done,
            'can_finish': edit_draft,
            'can_disband': st == 'done' and can_disband,
            'can_print': st != 'draft' and can_print,
        }

        if action == 'get':
            data = B.view(cur, batch)
            data.update(rights)
            data['summary'] = L.summary(cur, batch)
            return _resp(200, data)
        if action == 'log':
            return _resp(200, L.act_log(cur, batch))

        allowed = allowed_warehouses(actor, perms)
        if edit_draft:
            handlers = {
                'scan': lambda: B.act_scan(cur, actor, batch, body, allowed),
                'remove_scan': lambda: B.act_remove_scan(cur, actor, batch, body),
                'remove_item': lambda: B.act_remove_item(cur, actor, batch, body),
                'set_meta': lambda: act_meta(cur, actor, batch, body),
                'delete': lambda: act_delete(cur, actor, batch),
                'finish': lambda: L.act_finish(cur, actor, batch),
            }
        elif edit_done or rights['can_disband']:
            handlers = {}
            if edit_done:
                handlers.update({
                    'scan': lambda: B.act_scan(cur, actor, batch, body, allowed),
                    'take_find': lambda: L.act_take_find(cur, batch, body),
                    'take': lambda: L.act_take(cur, actor, batch, body, allowed),
                    'set_meta': lambda: act_meta(cur, actor, batch, body),
                })
            if rights['can_disband']:
                handlers['disband'] = lambda: L.act_disband(cur, actor, batch)
        else:
            return _resp(403, {'error': 'Эту партию вам менять нельзя'})

        if action == 'scan' and L.batch_ref(body.get('code')):
            return _resp(200, {'batch_ref': True, 'error': 'Это наклейка партии, а не товар'})
        if action not in handlers:
            return _resp(400, {'error': 'Это действие вам недоступно'})
        res = handlers[action]()
        if res.get('ok'):
            c.commit()
        else:
            c.rollback()
        return _resp(200, res)
    finally:
        c.close()