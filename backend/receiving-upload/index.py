import json
import os

import psycopg2
from psycopg2.extras import RealDictCursor

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token, X-Session-Id, X-User-Phone',
    'Access-Control-Max-Age': '86400',
}

TEXT_FIELDS = [
    'supplier_barcode', 'tech_name', 'serial_number', 'declared_defect',
    'brand', 'model', 'product_group', 'direction', 'order_number', 'supplier_code',
]
NUM_FIELDS = ['weight_gross', 'weight_net', 'volume', 'price']
ALL_FIELDS = TEXT_FIELDS + NUM_FIELDS


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


WRITE_ACTIONS = {'create_supplier', 'save_layout', 'start_upload', 'push_chunk', 'drop_upload'}
PERM_FOR = {'drop_upload': 'delete_data'}


def may(phone, perm_key):
    """Проверяет право на сервере: владельцу всё, остальным роль плюс личные настройки."""
    if not phone:
        return False
    with _conn() as c, c.cursor() as cur:
        cur.execute(f"SELECT role FROM users WHERE phone='{_esc(phone)}' LIMIT 1")
        u = cur.fetchone()
        if u and u[0] == 'owner':
            return True
        cur.execute(f"SELECT id, role_id FROM managers WHERE phone='{_esc(phone)}' LIMIT 1")
        m = cur.fetchone()
        if not m:
            return False
        mgr_id, role_id = m
        value = False
        if role_id:
            cur.execute(
                f"SELECT enabled FROM receiving_permissions "
                f"WHERE role_id={int(role_id)} AND perm_key='{_esc(perm_key)}'"
            )
            row = cur.fetchone()
            if row:
                value = row[0]
        cur.execute(
            f"SELECT enabled FROM receiving_permissions "
            f"WHERE manager_id={int(mgr_id)} AND perm_key='{_esc(perm_key)}'"
        )
        row = cur.fetchone()
        if row:
            value = row[0]
        return bool(value)


def _txt(v):
    if v is None:
        return 'NULL'
    s = str(v).strip()
    if not s or s.upper() == 'NULL':
        return 'NULL'
    return "'" + _esc(s[:500]) + "'"


def _num(v):
    if v is None or v == '':
        return 'NULL'
    try:
        return repr(round(float(v), 6))
    except (TypeError, ValueError):
        return 'NULL'


def list_suppliers():
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT s.id, s.name, "
            "(SELECT COUNT(*) FROM receiving_layouts l WHERE l.supplier_id = s.id) AS layouts, "
            "(SELECT COUNT(*) FROM receiving_items i WHERE i.supplier_id = s.id) AS items "
            "FROM receiving_suppliers s ORDER BY s.name"
        )
        return [dict(r) for r in cur.fetchall()]


def create_supplier(name):
    name = (name or '').strip()
    if not name:
        return None, 'Укажите название поставщика'
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT id, name FROM receiving_suppliers WHERE lower(name)=lower('{_esc(name)}')"
        )
        row = cur.fetchone()
        if row:
            return dict(row), None
        cur.execute(
            f"INSERT INTO receiving_suppliers (name) VALUES ('{_esc(name)}') RETURNING id, name"
        )
        return dict(cur.fetchone()), None


def get_layout(supplier_id, signature):
    if not supplier_id or not signature:
        return None
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT id, mapping FROM receiving_layouts "
            f"WHERE supplier_id={int(supplier_id)} "
            f"AND header_signature='{_esc(signature)}' LIMIT 1"
        )
        row = cur.fetchone()
        return dict(row) if row else None


def save_layout(supplier_id, signature, mapping):
    if not supplier_id or not signature:
        return
    payload = _esc(json.dumps(mapping, ensure_ascii=False))
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            f"INSERT INTO receiving_layouts (supplier_id, header_signature, mapping) "
            f"VALUES ({int(supplier_id)}, '{_esc(signature)}', '{payload}'::jsonb) "
            f"ON CONFLICT (supplier_id, header_signature) DO UPDATE "
            f"SET mapping=EXCLUDED.mapping, used_count=receiving_layouts.used_count+1, "
            f"last_used_at=NOW()"
        )


def check_barcodes(codes):
    codes = [str(c).strip() for c in (codes or []) if str(c or '').strip()]
    if not codes:
        return {'known': 0, 'known_codes': []}
    vals = ','.join("'" + _esc(c) + "'" for c in codes[:5000])
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            f"SELECT supplier_barcode FROM receiving_items "
            f"WHERE supplier_barcode IN ({vals})"
        )
        found = [r[0] for r in cur.fetchall()]
    return {'known': len(found), 'known_codes': found}


def start_upload(supplier_id, file_name, rows_read, user_id, user_name):
    uid = int(user_id) if user_id else 'NULL'
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            f"INSERT INTO receiving_uploads "
            f"(supplier_id, file_name, uploaded_by, uploaded_by_name, rows_read) "
            f"VALUES ({int(supplier_id)}, '{_esc(file_name or '')}', {uid}, "
            f"{_txt(user_name)}, {int(rows_read or 0)}) RETURNING id"
        )
        return cur.fetchone()[0]


def push_chunk(upload_id, supplier_id, rows):
    rows = rows or []
    tuples = []
    for r in rows:
        bc = str(r.get('supplier_barcode') or '').strip()
        tn = str(r.get('tech_name') or '').strip()
        if not bc or not tn:
            continue
        vals = [_txt(r.get(f)) for f in TEXT_FIELDS] + [_num(r.get(f)) for f in NUM_FIELDS]
        vals.append(str(int(upload_id)))
        vals.append(str(int(supplier_id)))
        tuples.append('(' + ','.join(vals) + ')')

    if not tuples:
        return {'added': 0, 'skipped': len(rows)}

    cols = ','.join(ALL_FIELDS + ['upload_id', 'supplier_id'])
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            f"WITH ins AS (INSERT INTO receiving_items ({cols}) VALUES {','.join(tuples)} "
            f"ON CONFLICT (supplier_barcode) DO NOTHING RETURNING 1) "
            f"SELECT COUNT(*) FROM ins"
        )
        added = int(cur.fetchone()[0])
        cur.execute(
            f"UPDATE receiving_uploads SET rows_added=rows_added+{added}, "
            f"rows_skipped=rows_skipped+{len(rows) - added} WHERE id={int(upload_id)}"
        )
    return {'added': added, 'skipped': len(rows) - added}


def list_uploads(limit=30):
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT u.id, u.file_name, u.uploaded_by_name, u.rows_read, u.rows_added, "
            "u.rows_skipped, u.created_at, s.name AS supplier_name "
            "FROM receiving_uploads u "
            "LEFT JOIN receiving_suppliers s ON s.id=u.supplier_id "
            f"ORDER BY u.id DESC LIMIT {int(limit)}"
        )
        return [dict(r) for r in cur.fetchall()]


def drop_upload(upload_id):
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            f"WITH d AS (DELETE FROM receiving_items WHERE upload_id={int(upload_id)} RETURNING 1) "
            f"SELECT COUNT(*) FROM d"
        )
        deleted = int(cur.fetchone()[0])
        cur.execute(f"DELETE FROM receiving_uploads WHERE id={int(upload_id)}")
    return {'deleted': deleted}


def handler(event: dict, context) -> dict:
    """Загрузка файлов поставщиков в таблицу приёмки: поставщики, схемы колонок, запись строк порциями, журнал загрузок."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET':
        if not action:
            return _resp(200, {'status': 'ok', 'service': 'receiving-upload'})
        if action == 'suppliers':
            return _resp(200, {'suppliers': list_suppliers()})
        if action == 'uploads':
            return _resp(200, {'uploads': list_uploads()})
        return _resp(400, {'error': 'Неизвестное действие'})

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Тело запроса не разобрать'})

    action = body.get('action') or action
    headers = event.get('headers') or {}
    user_id = headers.get('X-User-Id') or headers.get('x-user-id')
    phone = headers.get('X-User-Phone') or headers.get('x-user-phone') or ''
    user_name = body.get('user_name')

    if action in WRITE_ACTIONS:
        needed = PERM_FOR.get(action, 'upload_files')
        if not may(phone, needed):
            return _resp(403, {'error': 'Нет доступа к этому действию'})

    if action == 'create_supplier':
        sup, err = create_supplier(body.get('name'))
        if err:
            return _resp(400, {'error': err})
        return _resp(200, {'supplier': sup})

    if action == 'get_layout':
        return _resp(200, {'layout': get_layout(body.get('supplier_id'), body.get('signature'))})

    if action == 'save_layout':
        save_layout(body.get('supplier_id'), body.get('signature'), body.get('mapping') or {})
        return _resp(200, {'ok': True})

    if action == 'check_barcodes':
        return _resp(200, check_barcodes(body.get('barcodes')))

    if action == 'start_upload':
        if not body.get('supplier_id'):
            return _resp(400, {'error': 'Не выбран поставщик'})
        uid = start_upload(body['supplier_id'], body.get('file_name'),
                           body.get('rows_read'), user_id, user_name)
        return _resp(200, {'upload_id': uid})

    if action == 'push_chunk':
        if not body.get('upload_id') or not body.get('supplier_id'):
            return _resp(400, {'error': 'Не указана загрузка'})
        return _resp(200, push_chunk(body['upload_id'], body['supplier_id'], body.get('rows')))

    if action == 'drop_upload':
        if not body.get('upload_id'):
            return _resp(400, {'error': 'Не указана загрузка'})
        return _resp(200, drop_upload(body['upload_id']))

    return _resp(400, {'error': 'Неизвестное действие'})