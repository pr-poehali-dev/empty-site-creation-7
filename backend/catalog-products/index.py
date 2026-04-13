"""CRUD товаров каталога с загрузкой изображений"""
import json
import os
import base64
import uuid
import psycopg2
import boto3

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_user_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.phone, u.role FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,)
    )
    return cur.fetchone()

def get_manager_role_name(cur, phone):
    cur.execute(
        """SELECT r.name FROM managers m
           LEFT JOIN roles r ON r.id = m.role_id
           WHERE m.phone = %s AND m.status = 'authorized'""",
        (phone,)
    )
    row = cur.fetchone()
    return row[0] if row else None

def can_edit_products(cur, user):
    user_role = user[2]
    if user_role == 'owner':
        return True
    role_name = get_manager_role_name(cur, user[1])
    return role_name == 'Управляющий'

def get_s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY']
    )

def upload_image(s3, data_b64, content_type='image/jpeg'):
    data = base64.b64decode(data_b64)
    ext = 'jpg'
    if 'png' in content_type:
        ext = 'png'
    elif 'webp' in content_type:
        ext = 'webp'
    key = f"catalog/{uuid.uuid4().hex}.{ext}"
    s3.put_object(Bucket='files', Key=key, Body=data, ContentType=content_type)
    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
    return cdn_url

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')

    req_headers = event.get('headers', {})
    auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()

    user = get_user_by_token(cur, token)
    if not user:
        cur.close()
        conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    user_role = user[2]
    is_owner = user_role == 'owner'

    if method == 'GET':
        product_id = params.get('id')
        if product_id:
            if is_owner:
                cur.execute(
                    """SELECT p.id, p.category_id, p.name, p.article, p.brand, p.supplier_code,
                              p.price_base, p.price_retail, p.price_wholesale, p.price_purchase,
                              p.created_at, p.updated_at, c.name as category_name, p.product_group, p.external_id
                       FROM products p
                       JOIN categories c ON c.id = p.category_id
                       WHERE p.id = %s""",
                    (product_id,)
                )
            else:
                cur.execute(
                    """SELECT p.id, p.category_id, p.name, p.article, p.brand, p.supplier_code,
                              p.price_base, p.price_retail, p.price_wholesale, NULL as price_purchase,
                              p.created_at, p.updated_at, c.name as category_name, p.product_group, p.external_id
                       FROM products p
                       JOIN categories c ON c.id = p.category_id
                       WHERE p.id = %s""",
                    (product_id,)
                )
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Товар не найден'})}

            cur.execute(
                "SELECT id, url, sort_order FROM product_images WHERE product_id = %s ORDER BY sort_order",
                (product_id,)
            )
            images = [{'id': r[0], 'url': r[1], 'sort_order': r[2]} for r in cur.fetchall()]

            cur.execute(
                "SELECT id, barcode FROM product_barcodes WHERE product_id = %s ORDER BY id",
                (product_id,)
            )
            barcodes = [{'id': r[0], 'barcode': r[1]} for r in cur.fetchall()]

            item = {
                'id': row[0], 'category_id': row[1], 'name': row[2], 'article': row[3],
                'brand': row[4], 'supplier_code': row[5],
                'price_base': float(row[6]) if row[6] else None,
                'price_retail': float(row[7]) if row[7] else None,
                'price_wholesale': float(row[8]) if row[8] else None,
                'price_purchase': float(row[9]) if row[9] else None,
                'created_at': str(row[10]) if row[10] else None,
                'updated_at': str(row[11]) if row[11] else None,
                'category_name': row[12],
                'product_group': row[13],
                'external_id': row[14],
                'images': images,
                'barcodes': barcodes
            }
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'item': item})}

        barcode = params.get('barcode', '').strip()
        barcode_search = params.get('barcode_search', '').strip()
        if barcode or barcode_search:
            price_purchase_col = "p.price_purchase" if is_owner else "NULL as price_purchase"
            if barcode:
                cur.execute("SELECT product_id FROM product_barcodes WHERE barcode = %s LIMIT 1", (barcode,))
                bc_row = cur.fetchone()
                product_ids = [bc_row[0]] if bc_row else []
            else:
                cur.execute("SELECT DISTINCT product_id FROM product_barcodes WHERE barcode LIKE %s LIMIT 10", (f"%{barcode_search}%",))
                product_ids = [r[0] for r in cur.fetchall()]

            if not product_ids:
                cur.close()
                conn.close()
                return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': [], 'total': 0, 'page': 1, 'per_page': 50})}

            placeholders = ','.join(['%s'] * len(product_ids))
            cur.execute(
                f"""SELECT p.id, p.category_id, p.name, p.article, p.brand, p.supplier_code,
                           p.price_base, p.price_retail, p.price_wholesale, {price_purchase_col},
                           p.created_at, c.name as category_name, p.product_group, p.external_id
                    FROM products p
                    JOIN categories c ON c.id = p.category_id
                    WHERE p.id IN ({placeholders})""",
                tuple(product_ids)
            )
            rows = cur.fetchall()
            items = []
            for r in rows:
                items.append({
                    'id': r[0], 'category_id': r[1], 'name': r[2], 'article': r[3],
                    'brand': r[4], 'supplier_code': r[5],
                    'price_base': float(r[6]) if r[6] else None,
                    'price_retail': float(r[7]) if r[7] else None,
                    'price_wholesale': float(r[8]) if r[8] else None,
                    'price_purchase': float(r[9]) if r[9] else None,
                    'created_at': str(r[10]) if r[10] else None,
                    'category_name': r[11],
                    'product_group': r[12],
                    'external_id': r[13],
                    'images': [], 'barcodes': []
                })
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': items, 'total': len(items), 'page': 1, 'per_page': 50})}

        distinct_param = params.get('distinct', '').strip()
        if distinct_param == 'product_group':
            cur.execute("SELECT DISTINCT product_group FROM products WHERE product_group IS NOT NULL AND product_group != '' AND is_archived = false ORDER BY product_group")
            groups = [r[0] for r in cur.fetchall()]
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'groups': groups})}

        category_id = params.get('category_id')
        search = params.get('search', '').strip()
        search_type = params.get('search_type', 'all')
        filter_group = params.get('filter_group', '').strip()
        page = int(params.get('page', 1))
        per_page = int(params.get('per_page', 50))
        offset = (page - 1) * per_page

        show_archived = params.get('archived', 'false') == 'true'
        conditions = []
        values = []

        conditions.append("p.is_archived = %s")
        values.append(show_archived)

        if category_id:
            conditions.append("p.category_id = %s")
            values.append(int(category_id))

        if filter_group:
            conditions.append("p.product_group = %s")
            values.append(filter_group)

        if search:
            like = f"%{search}%"
            if search_type == 'article':
                conditions.append("p.article ILIKE %s")
                values.append(like)
            elif search_type == 'supplier_code':
                conditions.append("p.supplier_code ILIKE %s")
                values.append(like)
            elif search_type == 'product_group':
                conditions.append("p.product_group ILIKE %s")
                values.append(like)
            else:
                conditions.append("(p.name ILIKE %s OR p.article ILIKE %s OR p.brand ILIKE %s OR p.supplier_code ILIKE %s OR p.product_group ILIKE %s)")
                values.extend([like, like, like, like, like])

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        price_purchase_col = "p.price_purchase" if is_owner else "NULL as price_purchase"

        cur.execute(f"SELECT COUNT(*) FROM products p {where}", values)
        total = cur.fetchone()[0]

        cur.execute(
            f"""SELECT p.id, p.category_id, p.name, p.article, p.brand, p.supplier_code,
                       p.price_base, p.price_retail, p.price_wholesale, {price_purchase_col},
                       p.created_at, c.name as category_name, p.product_group, p.external_id
                FROM products p
                JOIN categories c ON c.id = p.category_id
                {where}
                ORDER BY p.name
                LIMIT %s OFFSET %s""",
            values + [per_page, offset]
        )
        rows = cur.fetchall()

        product_ids = [r[0] for r in rows]
        images_map = {}
        if product_ids:
            placeholders = ','.join(['%s'] * len(product_ids))
            cur.execute(
                f"""SELECT product_id, id, url, sort_order
                    FROM product_images
                    WHERE product_id IN ({placeholders})
                    ORDER BY sort_order""",
                product_ids
            )
            for img in cur.fetchall():
                images_map.setdefault(img[0], []).append({'id': img[1], 'url': img[2], 'sort_order': img[3]})

        barcodes_map = {}
        if product_ids:
            placeholders = ','.join(['%s'] * len(product_ids))
            cur.execute(
                f"SELECT product_id, barcode FROM product_barcodes WHERE product_id IN ({placeholders}) ORDER BY id",
                product_ids
            )
            for bc in cur.fetchall():
                barcodes_map.setdefault(bc[0], []).append(bc[1])

        items = []
        for r in rows:
            items.append({
                'id': r[0], 'category_id': r[1], 'name': r[2], 'article': r[3],
                'brand': r[4], 'supplier_code': r[5],
                'price_base': float(r[6]) if r[6] else None,
                'price_retail': float(r[7]) if r[7] else None,
                'price_wholesale': float(r[8]) if r[8] else None,
                'price_purchase': float(r[9]) if r[9] else None,
                'created_at': str(r[10]) if r[10] else None,
                'category_name': r[11],
                'product_group': r[12],
                'external_id': r[13],
                'images': images_map.get(r[0], []),
                'barcodes': barcodes_map.get(r[0], [])
            })

        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
            'items': items, 'total': total, 'page': page, 'per_page': per_page
        })}

    if method == 'POST':
        if not can_edit_products(cur, user):
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав для добавления товара'})}
        try:
            name = (body.get('name') or '').strip()
            category_id = body.get('category_id')
            article = (body.get('article') or '').strip() or None
            brand = (body.get('brand') or '').strip() or None
            supplier_code = (body.get('supplier_code') or '').strip() or None
            product_group = (body.get('product_group') or '').strip() or None
            price_base = body.get('price_base')
            price_retail = body.get('price_retail')
            price_wholesale = body.get('price_wholesale')
            price_purchase = body.get('price_purchase')
            images_data = body.get('images', [])

            if not name:
                cur.close()
                conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите название'})}

            if not category_id:
                cur.execute("SELECT id FROM categories WHERE name = 'Без категории' AND parent_id IS NULL LIMIT 1")
                row = cur.fetchone()
                if row:
                    category_id = row[0]
                else:
                    cur.execute("INSERT INTO categories (parent_id, name, sort_order) VALUES (NULL, 'Без категории', 9999) RETURNING id")
                    category_id = cur.fetchone()[0]

            cur.execute(
                """INSERT INTO products (category_id, name, article, brand, supplier_code,
                           price_base, price_retail, price_wholesale, price_purchase, product_group)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (category_id, name, article, brand, supplier_code,
                 price_base, price_retail, price_wholesale, price_purchase, product_group)
            )
            product_id = cur.fetchone()[0]

            if images_data:
                s3 = get_s3()
                for i, img in enumerate(images_data):
                    url = upload_image(s3, img.get('data', ''), img.get('content_type', 'image/jpeg'))
                    cur.execute(
                        "INSERT INTO product_images (product_id, url, sort_order) VALUES (%s, %s, %s)",
                        (product_id, url, i)
                    )

            barcodes_data = body.get('barcodes', [])
            for bc in barcodes_data:
                bc_val = bc.strip() if isinstance(bc, str) else str(bc).strip()
                if bc_val:
                    cur.execute(
                        "INSERT INTO product_barcodes (product_id, barcode) VALUES (%s, %s)",
                        (product_id, bc_val)
                    )

            conn.commit()
            cur.close()
            conn.close()
            return {'statusCode': 201, 'headers': headers, 'body': json.dumps({'id': product_id})}
        except Exception as e:
            import traceback
            err_msg = f"{type(e).__name__}: {str(e)}"
            print(f"POST error: {err_msg}")
            print(traceback.format_exc())
            try:
                conn.rollback()
                cur.close()
                conn.close()
            except Exception:
                pass
            return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': err_msg})}

    if method == 'PUT':
        if not can_edit_products(cur, user):
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав для редактирования товара'})}
        product_id = params.get('id')
        if not product_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id товара'})}

        name = (body.get('name') or '').strip()
        category_id = body.get('category_id')

        if not name:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите название'})}

        if not category_id:
            cur.execute("SELECT id FROM categories WHERE name = 'Без категории' AND parent_id IS NULL LIMIT 1")
            row_uncat = cur.fetchone()
            if row_uncat:
                category_id = row_uncat[0]
            else:
                cur.execute("INSERT INTO categories (parent_id, name, sort_order) VALUES (NULL, 'Без категории', 9999) RETURNING id")
                category_id = cur.fetchone()[0]

        cur.execute(
            """UPDATE products SET
                   name = %s, category_id = %s,
                   article = %s, brand = %s, supplier_code = %s,
                   price_base = %s, price_retail = %s, price_wholesale = %s, price_purchase = %s,
                   product_group = %s, updated_at = NOW()
               WHERE id = %s RETURNING id""",
            (name, category_id,
             (body.get('article') or '').strip() or None,
             (body.get('brand') or '').strip() or None,
             (body.get('supplier_code') or '').strip() or None,
             body.get('price_base'), body.get('price_retail'),
             body.get('price_wholesale'), body.get('price_purchase'),
             (body.get('product_group') or '').strip() or None,
             product_id)
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Товар не найден'})}

        new_images = body.get('images', [])
        if new_images:
            s3 = get_s3()
            for i, img in enumerate(new_images):
                url = upload_image(s3, img.get('data', ''), img.get('content_type', 'image/jpeg'))
                cur.execute(
                    "INSERT INTO product_images (product_id, url, sort_order) VALUES (%s, %s, %s)",
                    (product_id, url, 100 + i)
                )

        remove_images = body.get('remove_images', [])
        if remove_images:
            placeholders = ','.join(['%s'] * len(remove_images))
            cur.execute(
                f"DELETE FROM product_images WHERE id IN ({placeholders}) AND product_id = %s",
                remove_images + [product_id]
            )

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if method == 'DELETE':
        if not can_edit_products(cur, user):
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав для удаления товара'})}
        product_id = params.get('id')
        if not product_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id товара'})}

        permanent = params.get('permanent', 'false') == 'true'
        if permanent:
            cur.execute("SELECT COUNT(*) FROM wholesale_order_items WHERE product_id = %s", (product_id,))
            order_count = cur.fetchone()[0]
            if order_count > 0:
                cur.close()
                conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': f'Нельзя удалить — товар используется в {order_count} заявках. Можно только архивировать.'})}
            cur.execute("DELETE FROM product_images WHERE product_id = %s", (product_id,))
            cur.execute("DELETE FROM product_barcodes WHERE product_id = %s", (product_id,))
            cur.execute("DELETE FROM products WHERE id = %s", (product_id,))
        else:
            cur.execute("UPDATE products SET is_archived = true, updated_at = NOW() WHERE id = %s", (product_id,))

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if method == 'PATCH':
        if not can_edit_products(cur, user):
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав'})}
        product_id = params.get('id')
        action = params.get('action')
        if not product_id or action != 'restore':
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id и action=restore'})}
        cur.execute("UPDATE products SET is_archived = false, updated_at = NOW() WHERE id = %s RETURNING id", (product_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Товар не найден'})}
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}