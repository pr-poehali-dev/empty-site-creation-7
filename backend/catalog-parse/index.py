"""Загрузка каталога поставщика: разбор файла, отсев аксессуаров, сверка и запись товаров."""
import base64
import json
import os

import psycopg2
from psycopg2.extras import RealDictCursor

from parser import parse_catalog, convert_article, PRICE_FIELDS
from matcher import build_report, norm_article

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}

OUR_PRICE_COLS = ['price_base', 'price_retail', 'price_wholesale', 'price_purchase']


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


def _is_owner(cur, token):
    if not token:
        return False
    cur.execute(
        "SELECT u.role FROM users u JOIN user_sessions s ON s.user_id = u.id "
        "WHERE s.token = %s AND s.expires_at > NOW()",
        (token,)
    )
    row = cur.fetchone()
    return bool(row) and row[0] == 'owner'


def list_suppliers():
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT s.id, s.name, "
            "(SELECT COUNT(*) FROM catalog_layouts l WHERE l.supplier_id = s.id) AS layouts "
            "FROM catalog_suppliers s ORDER BY s.name"
        )
        return [dict(r) for r in cur.fetchall()]


def create_supplier(name):
    name = (name or '').strip()
    if not name:
        return None, 'Укажите название поставщика'
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM catalog_suppliers WHERE lower(name) = lower(%s)", (name,))
        row = cur.fetchone()
        if row:
            return dict(row), None
        cur.execute(
            "INSERT INTO catalog_suppliers (name) VALUES (%s) RETURNING id, name", (name,)
        )
        return dict(cur.fetchone()), None


def find_layout(supplier_id, signature):
    if not supplier_id or not signature:
        return None
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT mapping, price_mapping, excluded_categories, article_case "
            "FROM catalog_layouts WHERE supplier_id = %s AND header_signature = %s",
            (supplier_id, signature)
        )
        row = cur.fetchone()
        return dict(row) if row else None


def save_layout(supplier_id, signature, mapping, price_mapping, excluded, article_case):
    if not supplier_id or not signature:
        return
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            "INSERT INTO catalog_layouts "
            "(supplier_id, header_signature, mapping, price_mapping, excluded_categories, article_case) "
            "VALUES (%s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (supplier_id, header_signature) DO UPDATE SET "
            "mapping = EXCLUDED.mapping, price_mapping = EXCLUDED.price_mapping, "
            "excluded_categories = EXCLUDED.excluded_categories, "
            "article_case = EXCLUDED.article_case, "
            "used_count = catalog_layouts.used_count + 1, last_used_at = NOW()",
            (supplier_id, signature, json.dumps(mapping),
             json.dumps(price_mapping or {}), json.dumps(excluded or []), article_case)
        )


def _purge(cur):
    cur.execute("DELETE FROM catalog_drafts WHERE expires_at < NOW()")


def save_draft(supplier_id, file_name, data, draft_id=None):
    with _conn() as c, c.cursor() as cur:
        _purge(cur)
        payload = json.dumps(data.get('items') or [], ensure_ascii=False)
        if draft_id:
            cur.execute(
                "UPDATE catalog_drafts SET supplier_id = %s, file_name = %s, mapping = %s, "
                "price_mapping = %s, excluded_categories = %s, article_case = %s, "
                "vat_rate = %s, product_group = %s, fill_mode = %s, header_signature = %s, "
                "rows_data = %s, rows_count = %s WHERE id = %s RETURNING id",
                (supplier_id, file_name, json.dumps(data.get('mapping') or {}),
                 json.dumps(data.get('price_mapping') or {}),
                 json.dumps(data.get('excluded_categories') or []),
                 data.get('article_case'), data.get('vat_rate'), data.get('product_group'),
                 data.get('fill_mode') or 'empty_only', data.get('header_signature'), payload,
                 len(data.get('items') or []), draft_id)
            )
            row = cur.fetchone()
            if row:
                return row[0]
        cur.execute(
            "INSERT INTO catalog_drafts (supplier_id, file_name, mapping, price_mapping, "
            "excluded_categories, article_case, vat_rate, product_group, fill_mode, "
            "header_signature, rows_data, rows_count) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (supplier_id, file_name, json.dumps(data.get('mapping') or {}),
             json.dumps(data.get('price_mapping') or {}),
             json.dumps(data.get('excluded_categories') or []),
             data.get('article_case'), data.get('vat_rate'), data.get('product_group'),
             data.get('fill_mode') or 'empty_only', data.get('header_signature'),
             payload, len(data.get('items') or []))
        )
        return cur.fetchone()[0]


def get_draft(draft_id):
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        _purge(cur)
        cur.execute(
            "SELECT d.*, s.name AS supplier_name FROM catalog_drafts d "
            "LEFT JOIN catalog_suppliers s ON s.id = d.supplier_id WHERE d.id = %s",
            (draft_id,)
        )
        row = cur.fetchone()
        return dict(row) if row else None


def list_drafts():
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        _purge(cur)
        cur.execute(
            "SELECT d.id, d.file_name, d.rows_count, d.stage, d.created_at, "
            "s.name AS supplier_name FROM catalog_drafts d "
            "LEFT JOIN catalog_suppliers s ON s.id = d.supplier_id "
            "ORDER BY d.created_at DESC LIMIT 20"
        )
        return [dict(r) for r in cur.fetchall()]


def drop_draft(draft_id):
    with _conn() as c, c.cursor() as cur:
        cur.execute("DELETE FROM catalog_drafts WHERE id = %s", (draft_id,))


def apply_filters(items, excluded, article_case):
    """Отсев по категориям и приведение артикулов."""
    ex = set(excluded or [])
    out = []
    for it in items:
        if (it.get('category') or '—') in ex:
            continue
        row = dict(it)
        row['article'] = convert_article(row.get('article'), article_case or 'as_is')
        out.append(row)
    return out


def preview(draft_id, excluded, article_case):
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    items = apply_filters(d['rows_data'] or [], excluded, article_case)
    with _conn() as c, c.cursor() as cur:
        report, _ = build_report(cur, items)
    report['excluded_count'] = len(d['rows_data'] or []) - len(items)
    return report, None


def _price_values(item, price_mapping):
    """Раскладка цен файла по нашим четырём полям."""
    vals = {}
    for col in OUR_PRICE_COLS:
        src = (price_mapping or {}).get(col)
        vals[col] = item.get(src) if src in PRICE_FIELDS else None
    return vals


def commit(draft_id, opts):
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'

    excluded = opts.get('excluded_categories', d.get('excluded_categories') or [])
    article_case = opts.get('article_case') or d.get('article_case') or 'as_is'
    price_mapping = opts.get('price_mapping') or d.get('price_mapping') or {}
    vat_rate = opts.get('vat_rate') or d.get('vat_rate')
    product_group = opts.get('product_group') or d.get('product_group')
    fill_mode = opts.get('fill_mode') or 'empty_only'
    fill_fields = set(opts.get('fill_fields') or [])
    add_barcodes = opts.get('add_barcodes', True)

    items = apply_filters(d['rows_data'] or [], excluded, article_case)

    created = updated = bc_added = 0
    with _conn() as c, c.cursor() as cur:
        report, row_map = build_report(cur, items)

        cur.execute("SELECT id FROM categories WHERE name = 'Без категории' AND parent_id IS NULL LIMIT 1")
        row = cur.fetchone()
        if row:
            default_cat = row[0]
        else:
            cur.execute("INSERT INTO categories (parent_id, name, sort_order) "
                        "VALUES (NULL, 'Без категории', 9999) RETURNING id")
            default_cat = cur.fetchone()[0]

        seen_bc = set()
        for it in items:
            prices = _price_values(it, price_mapping)
            existing = row_map.get(it['row'])

            if existing:
                if fill_mode == 'skip':
                    product_id = existing['id']
                else:
                    sets = []
                    overwrite = fill_mode == 'overwrite'
                    pairs = [('tnved', 'tnved_code'), ('weight_gross', 'weight_gross'),
                             ('weight_net', 'weight_net')]
                    for src, col in pairs:
                        if src not in fill_fields:
                            continue
                        val = it.get(src)
                        if val in (None, ''):
                            continue
                        if overwrite:
                            sets.append(col + " = '" + _esc(val) + "'")
                        else:
                            sets.append(col + " = COALESCE(" + col + ", '" + _esc(val) + "')")
                    if overwrite:
                        for col, val in prices.items():
                            if val is not None:
                                sets.append(col + " = " + str(val))
                        if vat_rate:
                            sets.append("vat_rate = '" + _esc(vat_rate) + "'")
                    else:
                        if vat_rate:
                            sets.append("vat_rate = COALESCE(vat_rate, '" + _esc(vat_rate) + "')")
                    if sets:
                        cur.execute("UPDATE products SET " + ', '.join(sets)
                                    + ", updated_at = NOW() WHERE id = " + str(existing['id']))
                        updated += 1
                    product_id = existing['id']
            else:
                cur.execute(
                    "INSERT INTO products (category_id, name, article, brand, product_group, "
                    "price_base, price_retail, price_wholesale, price_purchase, "
                    "vat_rate, weight_gross, weight_net, tnved_code, is_new) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE) RETURNING id",
                    (default_cat, it['name'], it.get('article') or None,
                     it.get('brand') or None, product_group,
                     prices['price_base'], prices['price_retail'],
                     prices['price_wholesale'], prices['price_purchase'],
                     vat_rate, it.get('weight_gross'), it.get('weight_net'),
                     it.get('tnved') or None)
                )
                product_id = cur.fetchone()[0]
                created += 1
                if it.get('brand'):
                    cur.execute("INSERT INTO brands (name) VALUES (%s) ON CONFLICT (name) DO NOTHING",
                                (it['brand'],))

            bc = it.get('barcode')
            if add_barcodes and bc and bc not in seen_bc:
                seen_bc.add(bc)
                cur.execute(
                    "INSERT INTO product_barcodes (product_id, barcode) "
                    "SELECT %s, %s WHERE NOT EXISTS "
                    "(SELECT 1 FROM product_barcodes WHERE barcode = %s)",
                    (product_id, bc, bc)
                )
                bc_added += cur.rowcount

    sig = opts.get('header_signature') or d.get('header_signature')
    if sig:
        save_layout(d['supplier_id'], sig, d['mapping'], price_mapping, excluded, article_case)

    drop_draft(draft_id)
    return {'created': created, 'updated': updated, 'barcodes_added': bc_added,
            'excluded': len(d['rows_data'] or []) - len(items)}, None


def handler(event, context):
    """Загрузка каталога поставщика: разбор Excel, отсев аксессуаров, сверка с номенклатурой."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'catalog-parse'})

    with _conn() as c, c.cursor() as cur:
        if not _is_owner(cur, token):
            return _resp(403, {'error': 'Доступно только владельцу'})

    if method == 'GET':
        if action == 'suppliers':
            return _resp(200, {'suppliers': list_suppliers()})
        if action == 'drafts':
            return _resp(200, {'drafts': list_drafts()})
        if action == 'draft':
            did = params.get('id')
            if not did:
                return _resp(400, {'error': 'Не указан черновик'})
            d = get_draft(did)
            if not d:
                return _resp(404, {'error': 'Черновик истёк'})
            return _resp(200, {'draft': d})
        return _resp(400, {'error': 'Неизвестное действие'})

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

    if action == 'parse':
        file_b64 = body.get('file')
        if not file_b64:
            return _resp(400, {'error': 'Не передан файл'})
        try:
            data = base64.b64decode(file_b64)
        except Exception:
            return _resp(400, {'error': 'Файл не читается'})
        result = parse_catalog(data, body.get('file_name'), body.get('mapping'))
        if result.get('error'):
            return _resp(400, result)
        supplier_id = body.get('supplier_id')
        saved = find_layout(supplier_id, result['header_signature'])
        if saved and not body.get('mapping'):
            result = parse_catalog(data, body.get('file_name'), saved['mapping'])
            result['price_mapping'] = saved.get('price_mapping') or {}
            result['excluded_categories'] = saved.get('excluded_categories') or []
            result['article_case'] = saved.get('article_case')
            result['layout_reused'] = True
        draft_id = save_draft(supplier_id, body.get('file_name'), result, body.get('draft_id'))
        result['draft_id'] = draft_id
        result.pop('items', None)
        return _resp(200, result)

    if action == 'preview':
        rep, err = preview(body.get('draft_id'), body.get('excluded_categories'),
                           body.get('article_case'))
        if err:
            return _resp(404, {'error': err})
        return _resp(200, {'report': rep})

    if action == 'commit':
        res, err = commit(body.get('draft_id'), body)
        if err:
            return _resp(404, {'error': err})
        return _resp(200, {'result': res})

    if action == 'drop_draft':
        drop_draft(body.get('draft_id'))
        return _resp(200, {'ok': True})

    return _resp(400, {'error': 'Неизвестное действие'})