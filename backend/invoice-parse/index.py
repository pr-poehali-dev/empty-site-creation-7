import base64
import json
import os

import psycopg2
from psycopg2.extras import RealDictCursor

from parser import parse_invoice

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}


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


def list_suppliers():
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT s.id, s.name, "
            "(SELECT COUNT(*) FROM invoice_layouts l WHERE l.supplier_id = s.id) AS layouts "
            "FROM invoice_suppliers s ORDER BY s.name"
        )
        return [dict(r) for r in cur.fetchall()]


def create_supplier(name):
    name = (name or '').strip()
    if not name:
        return None, 'Укажите название поставщика'
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT id, name FROM invoice_suppliers WHERE lower(name) = lower('{_esc(name)}')"
        )
        row = cur.fetchone()
        if row:
            return dict(row), None
        cur.execute(
            f"INSERT INTO invoice_suppliers (name) VALUES ('{_esc(name)}') RETURNING id, name"
        )
        return dict(cur.fetchone()), None


def find_layout(supplier_id, signature):
    if not supplier_id or not signature:
        return None
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT id, mapping FROM invoice_layouts "
            f"WHERE supplier_id = {int(supplier_id)} "
            f"AND header_signature = '{_esc(signature)}' LIMIT 1"
        )
        row = cur.fetchone()
        return dict(row) if row else None


def save_layout(supplier_id, signature, mapping):
    if not supplier_id or not signature:
        return
    payload = _esc(json.dumps(mapping, ensure_ascii=False))
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            f"INSERT INTO invoice_layouts (supplier_id, header_signature, mapping) "
            f"VALUES ({int(supplier_id)}, '{_esc(signature)}', '{payload}'::jsonb) "
            f"ON CONFLICT (supplier_id, header_signature) DO UPDATE "
            f"SET mapping = EXCLUDED.mapping, used_count = invoice_layouts.used_count + 1, "
            f"last_used_at = NOW()"
        )


def save_draft(supplier_id, file_name, mapping, items):
    sup = int(supplier_id) if supplier_id else 'NULL'
    rows_json = _esc(json.dumps(items, ensure_ascii=False))
    map_json = _esc(json.dumps(mapping, ensure_ascii=False))
    with _conn() as c, c.cursor() as cur:
        cur.execute("DELETE FROM invoice_drafts WHERE expires_at < NOW()")
        cur.execute(
            f"INSERT INTO invoice_drafts (supplier_id, file_name, mapping, rows_data, rows_count) "
            f"VALUES ({sup}, '{_esc(file_name or '')}', '{map_json}'::jsonb, "
            f"'{rows_json}'::jsonb, {len(items)}) RETURNING id"
        )
        return cur.fetchone()[0]


def handler(event, context):
    """Разбор счёта поставщика из Excel: поиск шапки, опознание колонок, цена = сумма / количество."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET':
        if action == 'suppliers':
            return _resp(200, {'suppliers': list_suppliers()})
        return _resp(200, {'status': 'ok', 'service': 'invoice-parse'})

    if method != 'POST':
        return _resp(405, {'error': 'Метод не поддерживается'})

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Некорректный запрос'})

    action = body.get('action') or action

    if action == 'create_supplier':
        sup, err = create_supplier(body.get('name'))
        if err:
            return _resp(400, {'error': err})
        return _resp(200, {'supplier': sup})

    if action == 'confirm':
        supplier_id = body.get('supplier_id')
        mapping = body.get('mapping') or {}
        signature = body.get('header_signature') or ''
        items = body.get('items') or []
        if not items:
            return _resp(400, {'error': 'Нет строк для сохранения'})
        save_layout(supplier_id, signature, mapping)
        draft_id = save_draft(supplier_id, body.get('file_name'), mapping, items)
        return _resp(200, {'draft_id': draft_id, 'saved': len(items)})

    if action == 'parse':
        file_b64 = body.get('file')
        if not file_b64:
            return _resp(400, {'error': 'Файл не передан'})
        file_name = body.get('file_name') or 'invoice.xlsx'
        supplier_id = body.get('supplier_id')
        forced = body.get('mapping')

        try:
            data = base64.b64decode(file_b64)
        except Exception:
            return _resp(400, {'error': 'Файл повреждён'})

        result = parse_invoice(data, file_name, forced_mapping=forced)
        if 'error' in result:
            return _resp(400, result)

        layout_used = False
        if not forced and supplier_id:
            saved = find_layout(supplier_id, result['header_signature'])
            if saved:
                result = parse_invoice(data, file_name, forced_mapping=saved['mapping'])
                layout_used = True

        result['layout_used'] = layout_used
        result['file_name'] = file_name
        return _resp(200, result)

    return _resp(400, {'error': 'Неизвестное действие'})
