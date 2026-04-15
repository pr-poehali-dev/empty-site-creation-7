"""API обмена данными с 1С: схема полей, управление ключом, импорт/экспорт товаров"""
import json
import os
import uuid
import base64
import io
import psycopg2
import boto3
from PIL import Image

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY']
    )

def upload_image_with_thumb(s3, data_b64, content_type='image/jpeg'):
    data = base64.b64decode(data_b64)
    ext = 'jpg'
    if 'png' in content_type:
        ext = 'png'
    elif 'webp' in content_type:
        ext = 'webp'
    uid = uuid.uuid4().hex
    key = f"catalog/{uid}.{ext}"
    s3.put_object(Bucket='files', Key=key, Body=data, ContentType=content_type)
    cdn_base = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket"
    cdn_url = f"{cdn_base}/{key}"
    thumb_url = None
    try:
        img = Image.open(io.BytesIO(data))
        img.thumbnail((200, 200))
        buf = io.BytesIO()
        img.save(buf, format='WEBP', quality=75)
        buf.seek(0)
        thumb_key = f"catalog/thumb/{uid}.webp"
        s3.put_object(Bucket='files', Key=thumb_key, Body=buf.read(), ContentType='image/webp')
        thumb_url = f"{cdn_base}/{thumb_key}"
    except Exception:
        pass
    return cdn_url, thumb_url

def resp(status, data):
    return {
        'statusCode': status,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(data, ensure_ascii=False, default=str)
    }

def get_api_key(cur):
    cur.execute("SELECT value FROM settings WHERE key = 'exchange_api_key'")
    row = cur.fetchone()
    return row[0] if row else None

def get_owner_by_token(cur, token):
    if not token:
        return None
    cur.execute(
        """SELECT u.id, u.phone, u.role FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,)
    )
    user = cur.fetchone()
    if user and user[2] == 'owner':
        return user
    return None

def handle_get_key(conn, token):
    cur = conn.cursor()
    owner = get_owner_by_token(cur, token)
    if not owner:
        cur.close()
        return resp(403, {"error": "Доступ запрещён"})
    key = get_api_key(cur)
    cur.close()
    return resp(200, {"key": key or ""})

def handle_set_key(conn, token):
    cur = conn.cursor()
    owner = get_owner_by_token(cur, token)
    if not owner:
        cur.close()
        return resp(403, {"error": "Доступ запрещён"})
    new_key = str(uuid.uuid4())
    cur.execute(
        """INSERT INTO settings (key, value, updated_at) VALUES ('exchange_api_key', %s, NOW())
           ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = NOW()""",
        (new_key, new_key)
    )
    conn.commit()
    cur.close()
    return resp(200, {"key": new_key})

def check_api_key(cur, req_headers):
    api_key = req_headers.get('X-Api-Key', '')
    if not api_key:
        return False
    expected = get_api_key(cur)
    return expected and api_key == expected

def handle_schema(conn):
    cur = conn.cursor()
    product_fields = [
        {"key": "name", "label": "Наименование", "type": "string", "required": True},
        {"key": "article", "label": "Артикул", "type": "string", "required": False},
        {"key": "brand", "label": "Бренд", "type": "string", "required": False},
        {"key": "supplier_code", "label": "Код поставщика", "type": "string", "required": False},
        {"key": "barcode", "label": "Штрихкод", "type": "string", "required": False},
        {"key": "product_group", "label": "Группа", "type": "string", "required": False},
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
    return resp(200, {"product_fields": product_fields, "price_types": price_types, "categories": categories})

def handle_import_products(conn, body):
    products = body.get("products", [])
    if not products:
        return resp(400, {"error": "Пустой массив товаров"})
    cur = conn.cursor()
    created = 0
    updated = 0
    errors = []
    results = []
    s3_client = None

    ext_ids = [p.get("external_id") for p in products if p.get("external_id")]
    existing_map = {}
    if ext_ids:
        cur.execute("SELECT external_id, id FROM products WHERE external_id = ANY(%s)", (ext_ids,))
        existing_map = {row[0]: row[1] for row in cur.fetchall()}

    cat_names = set()
    cat_ext_ids = set()
    for item in products:
        if item.get("category_external_id"):
            cat_ext_ids.add(item["category_external_id"])
        if item.get("category_name"):
            cat_names.add(item["category_name"])
    cat_by_ext = {}
    cat_by_name = {}
    if cat_ext_ids:
        cur.execute("SELECT external_id, id FROM categories WHERE external_id = ANY(%s)", (list(cat_ext_ids),))
        cat_by_ext = {row[0]: row[1] for row in cur.fetchall()}
    if cat_names:
        cur.execute("SELECT name, id FROM categories WHERE name = ANY(%s)", (list(cat_names),))
        cat_by_name = {row[0]: row[1] for row in cur.fetchall()}

    to_insert = []
    to_update = []
    barcodes_to_add = []
    images_to_process = []

    for item in products:
        ext_id = item.get("external_id")
        if not ext_id:
            errors.append({"item": item.get("name", "?"), "error": "Нет external_id"})
            continue
        name = item.get("name")
        if not name:
            errors.append({"external_id": ext_id, "error": "Нет наименования"})
            continue
        category_id = None
        category_ext_id = item.get("category_external_id")
        if category_ext_id:
            category_id = cat_by_ext.get(category_ext_id)
        if not category_id:
            category_name = item.get("category_name")
            if category_name:
                category_id = cat_by_name.get(category_name)
                if not category_id:
                    cur.execute(
                        "INSERT INTO categories (name, external_id) VALUES (%s, %s) RETURNING id",
                        (category_name, category_ext_id)
                    )
                    category_id = cur.fetchone()[0]
                    cat_by_name[category_name] = category_id
                    if category_ext_id:
                        cat_by_ext[category_ext_id] = category_id
        if not category_id:
            errors.append({"external_id": ext_id, "error": "Не удалось определить категорию"})
            continue
        fields = {
            "name": name,
            "category_id": category_id,
            "article": item.get("article"),
            "brand": item.get("brand"),
            "supplier_code": item.get("supplier_code"),
            "product_group": item.get("product_group"),
            "product_group_id": item.get("product_group_id"),
            "price_base": item.get("price_base"),
            "price_retail": item.get("price_retail"),
            "price_wholesale": item.get("price_wholesale"),
            "price_purchase": item.get("price_purchase"),
        }
        fields = {k: v for k, v in fields.items() if v is not None}
        if ext_id in existing_map:
            product_id = existing_map[ext_id]
            to_update.append((fields, product_id, ext_id))
        else:
            to_insert.append((fields, ext_id))
        barcode = item.get("barcode")
        if barcode:
            barcodes_to_add.append((ext_id, barcode))
        images = item.get("images", [])
        if images:
            images_to_process.append((ext_id, images))

    for fields, product_id, ext_id in to_update:
        set_parts = [f"{k} = %s" for k in fields]
        set_parts.append("updated_at = NOW()")
        vals = list(fields.values())
        vals.append(product_id)
        cur.execute(f"UPDATE products SET {', '.join(set_parts)} WHERE id = %s", vals)
        updated += 1
        results.append({"external_id": ext_id, "id": product_id})

    for fields, ext_id in to_insert:
        fields["external_id"] = ext_id
        cols = list(fields.keys())
        vals = list(fields.values())
        placeholders = ["%s"] * len(vals)
        cur.execute(
            f"INSERT INTO products ({', '.join(cols)}) VALUES ({', '.join(placeholders)}) RETURNING id",
            vals
        )
        product_id = cur.fetchone()[0]
        existing_map[ext_id] = product_id
        created += 1
        results.append({"external_id": ext_id, "id": product_id})

    if barcodes_to_add:
        product_ids_for_bc = [existing_map[e] for e, _ in barcodes_to_add if e in existing_map]
        existing_barcodes = set()
        if product_ids_for_bc:
            cur.execute("SELECT product_id, barcode FROM product_barcodes WHERE product_id = ANY(%s)", (product_ids_for_bc,))
            existing_barcodes = {(row[0], row[1]) for row in cur.fetchall()}
        insert_bc = []
        for ext_id, barcode in barcodes_to_add:
            pid = existing_map.get(ext_id)
            if pid and (pid, barcode) not in existing_barcodes:
                insert_bc.append((pid, barcode))
        if insert_bc:
            args = ",".join(cur.mogrify("(%s,%s)", row).decode() for row in insert_bc)
            cur.execute(f"INSERT INTO product_barcodes (product_id, barcode) VALUES {args}")

    for ext_id, images in images_to_process:
        pid = existing_map.get(ext_id)
        if not pid:
            continue
        if not s3_client:
            s3_client = get_s3()
        for idx, img_data in enumerate(images):
            data_b64 = img_data if isinstance(img_data, str) else img_data.get("data", "")
            ct = "image/jpeg" if isinstance(img_data, str) else img_data.get("content_type", "image/jpeg")
            if not data_b64:
                continue
            try:
                url, thumb_url = upload_image_with_thumb(s3_client, data_b64, ct)
                cur.execute(
                    "INSERT INTO product_images (product_id, url, thumbnail_url, sort_order) VALUES (%s, %s, %s, %s)",
                    (pid, url, thumb_url, idx)
                )
            except Exception:
                pass

    conn.commit()
    cur.close()
    return resp(200, {"created": created, "updated": updated, "errors": errors, "products": results})

def handle_export_products(conn, params):
    cur = conn.cursor()
    since = params.get("since")
    query = """SELECT p.id, p.external_id, p.name, p.article, p.brand, p.supplier_code,
                      p.price_base, p.price_retail, p.price_wholesale, p.price_purchase,
                      p.category_id, c.name as category_name, c.external_id as category_external_id,
                      p.updated_at, p.product_group
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
            "product_group": r[14],
            "barcodes": barcodes
        })
    cur.close()
    return resp(200, {"products": items, "total": len(items)})

def handle_link_products(conn, body):
    links = body.get("links", [])
    if not links:
        return resp(400, {"error": "Пустой массив связок"})
    cur = conn.cursor()
    linked = 0
    errors = []
    for item in links:
        product_id = item.get("id")
        ext_id = item.get("external_id")
        if not product_id or not ext_id:
            errors.append({"id": product_id, "error": "Нет id или external_id"})
            continue
        cur.execute("SELECT id FROM products WHERE id = %s", (product_id,))
        if not cur.fetchone():
            errors.append({"id": product_id, "error": "Товар не найден"})
            continue
        cur.execute("UPDATE products SET external_id = %s, updated_at = NOW() WHERE id = %s", (ext_id, product_id))
        linked += 1
    conn.commit()
    cur.close()
    return resp(200, {"linked": linked, "errors": errors})

def handler(event: dict, context) -> dict:
    """Обмен данными с 1С: управление ключом, схема, импорт и экспорт товаров"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key, X-Authorization, Authorization',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    req_headers = event.get('headers', {})

    if action in ('get_key', 'set_key'):
        auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        conn = get_db()
        try:
            if method == 'GET' and action == 'get_key':
                return handle_get_key(conn, token)
            elif method == 'POST' and action == 'set_key':
                return handle_set_key(conn, token)
            else:
                return resp(400, {"error": "Метод не поддерживается"})
        finally:
            conn.close()

    conn = get_db()
    try:
        cur = conn.cursor()
        if not check_api_key(cur, req_headers):
            cur.close()
            return resp(403, {"error": "Неверный API-ключ"})
        cur.close()

        if method == 'GET' and action == 'schema':
            return handle_schema(conn)
        elif method == 'GET' and action == 'products':
            return handle_export_products(conn, params)
        elif method == 'POST' and action == 'products':
            body = json.loads(event.get('body') or '{}')
            return handle_import_products(conn, body)
        elif method == 'POST' and action == 'link_products':
            body = json.loads(event.get('body') or '{}')
            return handle_link_products(conn, body)
        else:
            return resp(400, {"error": "Неизвестное действие. Используйте ?action=schema|products|link_products"})
    finally:
        conn.close()