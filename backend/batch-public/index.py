import json
import os
import re

import psycopg2
from psycopg2.extras import RealDictCursor

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}
KEY_RE = re.compile(r'^[A-Za-z0-9_-]{10,64}$')
NAME = (
    "regexp_replace(btrim(COALESCE(i.product_group,'') || ' ' || COALESCE(i.brand,'') || ' ' || "
    "COALESCE(i.model,'')), '\\s+', ' ', 'g')"
)
STATUS = {'done': 'Собрана', 'disbanded': 'Разобрана', 'sold': 'Продана', 'written_off': 'Списана'}


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json', **CORS},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def handler(event: dict, context) -> dict:
    """Открытая страница партии по вечному ключу из ссылки или QR: номер, дата, склад и состав «наименование — штук» (у смешанной — с разбивкой по складам). Без входа, без цен, наклеек и сотрудников."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}
    key = ((event.get('queryStringParameters') or {}).get('key') or '').strip()
    if not KEY_RE.match(key):
        return _resp(404, {'error': 'Партия не найдена'})

    c = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        cur = c.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            f"SELECT id, number, status, warehouse, mixed, finished_at, closed_at "
            f"FROM receiving_batches WHERE public_key='{key}' AND status NOT IN ('draft','deleted') LIMIT 1"
        )
        b = cur.fetchone()
        if not b:
            return _resp(404, {'error': 'Партия не найдена'})
        cur.execute(
            f"SELECT {NAME} AS name, i.warehouse, COUNT(*) AS qty, MAX(bi.added_at) AS last_at "
            f"FROM receiving_batch_items bi JOIN receiving_items i ON i.id=bi.item_id "
            f"WHERE bi.batch_id={int(b['id'])} AND bi.active GROUP BY 1, 2"
        )
        rows = cur.fetchall()
    finally:
        c.close()

    groups = {}
    for r in rows:
        name = r['name'] or 'Товар'
        g = groups.setdefault(name, {'name': name, 'qty': 0, 'parts': [], 'last_at': r['last_at']})
        g['qty'] += int(r['qty'])
        g['parts'].append({'warehouse': r['warehouse'], 'qty': int(r['qty'])})
        g['last_at'] = max(g['last_at'], r['last_at'])
    items = sorted(groups.values(), key=lambda g: g['last_at'], reverse=True)
    for g in items:
        g.pop('last_at')
        if not b['mixed'] or len(g['parts']) < 2:
            g['parts'] = [] if not b['mixed'] else g['parts']
        g['parts'].sort(key=lambda p: -p['qty'])

    return _resp(200, {
        'number': b['number'],
        'status': b['status'],
        'status_title': STATUS.get(b['status'], b['status']),
        'warehouse': 'Смешанная' if b['mixed'] else b['warehouse'],
        'mixed': bool(b['mixed']),
        'date': b['finished_at'],
        'closed_at': b['closed_at'],
        'total': sum(g['qty'] for g in items),
        'items': items,
    })
