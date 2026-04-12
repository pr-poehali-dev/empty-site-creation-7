"""API обмена данными с 1С: схема полей, импорт/экспорт товаров"""
import json
import os
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def resp(status, data):
    return {
        'statusCode': status,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(data, ensure_ascii=False, default=str)
    }

def handle_schema(conn):
    cur = conn.cursor()

    product_fields = [
        {"key": "name", "label": "Наименование", "type": "string", "required": True},
        {"key": "article", "label": "Артикул", "type": "string", "required": False},
        {"key": "brand", "label": "Бренд", "type": "string", "required": False},
        {"key": "supplier_code", "label": "Код поставщика", "type": "string", "required": False},
        {"key": "barcode", "label": "Штрихкод", "type": "string", "required": False},
    ]

    price_types = [
        {"key": "price_base", "label": "Базовая цена"},
        {"key": "price_retail", "label": "Розничная цена"},
        {"key": "price_wholesale", "label": "Оптовая цена"},
        {"key": "price_purchase", "label": "Закупочная цена"},
    ]

    cur.execute("SELECT id, parent_id, name FROM categories ORDER BY sort_order, name")
    rows = cur.fetchall()
    categories = [{"id": r[0], "parent_id": r[1], "name": r[2]} for r in rows]

    cur.close()
    return resp(200, {
        "product_fields": product_fields,
        "price_types": price_types,
        "categories": categories
    })

def handle_import_products(conn, body):
    products = body.get("products", [])
    if not products:
        return resp(400, {"error": "Пустой массив товаров"})

    cur = conn.cursor()
    created = 0
    updated = 0
    errors = []

    for item in products:
        ext_id = item.get("external_id")
        if not ext_id:
            errors.append({"item": item.get("name", "?"), "error": "Нет external_id"})
            continue

        name = item.get("name")
        if not name:
            errors.append({"external_id": ext_id, "error": "Нет наименования"})
            continue

        category_ext_id = item.get("category_external_id")
        category_id = None
        if category_ext_id:
            cur.execute("SELECT id FROM categories WHERE external_id = %s", (category_ext_id,))
            row = cur.fetchone()
            if row:
                category_id = row[0]

        if not category_id:
            category_name = item.get("category_name")
            if category_name:
                cur.execute("SELECT id FROM categories WHERE name = %s LIMIT 1", (category_name,))
                row = cur.fetchone()
                if row:
                    category_id = row[0]
                else:
                    cur.execute(
                        "INSERT INTO categories (name, external_id) VALUES (%s, %s) RETURNING id",
                        (category_name, category_ext_id)
                    )
                    category_id = cur.fetchone()[0]

        if not category_id:
            errors.append({"external_id": ext_id, "error": "Не удалось определить категорию"})
            continue

        cur.execute("SELECT id FROM products WHERE external_id = %s", (ext_id,))
        existing = cur.fetchone()

        fields = {
            "name": name,
            "category_id": category_id,
            "article": item.get("article"),
            "brand": item.get("brand"),
            "supplier_code": item.get("supplier_code"),
            "price_base": item.get("price_base"),
            "price_retail": item.get("price_retail"),
            "price_wholesale": item.get("price_wholesale"),
            "price_purchase": item.get("price_purchase"),
        }
        fields = {k: v for k, v in fields.items() if v is not None}

        if existing:
            product_id = existing[0]
            set_parts = [f"{k} = %s" for k in fields]
            set_parts.append("updated_at = NOW()")
            vals = list(fields.values())
            vals.append(product_id)
            cur.execute(f"UPDATE products SET {', '.join(set_parts)} WHERE id = %s", vals)
            updated += 1
        else:
            fields["external_id"] = ext_id
            cols = list(fields.keys())
            vals = list(fields.values())
            placeholders = ["%s"] * len(vals)
            cur.execute(
                f"INSERT INTO products ({', '.join(cols)}) VALUES ({', '.join(placeholders)}) RETURNING id",
                vals
            )
            product_id = cur.fetchone()[0]
            created += 1

        barcode = item.get("barcode")
        if barcode:
            cur.execute(
                "SELECT id FROM product_barcodes WHERE product_id = %s AND barcode = %s",
                (product_id, barcode)
            )
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO product_barcodes (product_id, barcode) VALUES (%s, %s)",
                    (product_id, barcode)
                )

    conn.commit()
    cur.close()
    return resp(200, {"created": created, "updated": updated, "errors": errors})

def handle_export_products(conn, params):
    cur = conn.cursor()
    since = params.get("since")

    query = """SELECT p.id, p.external_id, p.name, p.article, p.brand, p.supplier_code,
                      p.price_base, p.price_retail, p.price_wholesale, p.price_purchase,
                      p.category_id, c.name as category_name, c.external_id as category_external_id,
                      p.updated_at
               FROM products p
               JOIN categories c ON c.id = p.category_id
               WHERE p.is_archived = false"""
    vals = []
    if since:
        query += " AND p.updated_at > %s"
        vals.append(since)
    query += " ORDER BY p.id"

    cur.execute(query, vals)
    rows = cur.fetchall()

    items = []
    for r in rows:
        product_id = r[0]
        cur.execute("SELECT barcode FROM product_barcodes WHERE product_id = %s", (product_id,))
        barcodes = [b[0] for b in cur.fetchall()]

        items.append({
            "id": r[0], "external_id": r[1], "name": r[2], "article": r[3],
            "brand": r[4], "supplier_code": r[5],
            "price_base": float(r[6]) if r[6] else None,
            "price_retail": float(r[7]) if r[7] else None,
            "price_wholesale": float(r[8]) if r[8] else None,
            "price_purchase": float(r[9]) if r[9] else None,
            "category_id": r[10], "category_name": r[11],
            "category_external_id": r[12],
            "updated_at": str(r[13]),
            "barcodes": barcodes
        })

    cur.close()
    return resp(200, {"products": items, "total": len(items)})

def handler(event: dict, context) -> dict:
    """Обмен данными с 1С: схема, импорт и экспорт товаров"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    req_headers = event.get('headers', {})
    api_key = req_headers.get('X-Api-Key', '')
    expected_key = os.environ.get('EXCHANGE_API_KEY', '')
    if not expected_key or api_key != expected_key:
        return resp(403, {"error": "Неверный API-ключ"})

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    conn = get_db()
    try:
        if method == 'GET' and action == 'schema':
            return handle_schema(conn)
        elif method == 'GET' and action == 'products':
            return handle_export_products(conn, params)
        elif method == 'POST' and action == 'products':
            body = json.loads(event.get('body') or '{}')
            return handle_import_products(conn, body)
        else:
            return resp(400, {"error": "Неизвестное действие. Используйте ?action=schema|products"})
    finally:
        conn.close()
