"""CRUD номенклатуры каталога с загрузкой изображений"""
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
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
        nom_id = params.get('id')
        if nom_id:
            if is_owner:
                cur.execute(
                    """SELECT n.id, n.category_id, n.name, n.article, n.brand, n.supplier_code,
                              n.price_base, n.price_retail, n.price_wholesale, n.price_purchase,
                              n.created_at, n.updated_at, c.name as category_name
                       FROM nomenclature n
                       JOIN categories c ON c.id = n.category_id
                       WHERE n.id = %s""",
                    (nom_id,)
                )
            else:
                cur.execute(
                    """SELECT n.id, n.category_id, n.name, n.article, n.brand, n.supplier_code,
                              n.price_base, n.price_retail, n.price_wholesale, NULL as price_purchase,
                              n.created_at, n.updated_at, c.name as category_name
                       FROM nomenclature n
                       JOIN categories c ON c.id = n.category_id
                       WHERE n.id = %s""",
                    (nom_id,)
                )
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Номенклатура не найдена'})}

            cur.execute(
                "SELECT id, url, sort_order FROM nomenclature_images WHERE nomenclature_id = %s ORDER BY sort_order",
                (nom_id,)
            )
            images = [{'id': r[0], 'url': r[1], 'sort_order': r[2]} for r in cur.fetchall()]

            cur.execute(
                "SELECT id, barcode FROM nomenclature_barcodes WHERE nomenclature_id = %s ORDER BY id",
                (nom_id,)
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
                'images': images,
                'barcodes': barcodes
            }
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'item': item})}

        barcode = params.get('barcode', '').strip()
        if barcode:
            cur.execute(
                "SELECT nomenclature_id FROM nomenclature_barcodes WHERE barcode = %s LIMIT 1",
                (barcode,)
            )
            bc_row = cur.fetchone()
            if not bc_row:
                cur.close()
                conn.close()
                return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': [], 'total': 0, 'page': 1, 'per_page': 50})}

            found_id = bc_row[0]
            price_purchase_col = "n.price_purchase" if is_owner else "NULL as price_purchase"
            cur.execute(
                f"""SELECT n.id, n.category_id, n.name, n.article, n.brand, n.supplier_code,
                           n.price_base, n.price_retail, n.price_wholesale, {price_purchase_col},
                           n.created_at, c.name as category_name
                    FROM nomenclature n
                    JOIN categories c ON c.id = n.category_id
                    WHERE n.id = %s""",
                (found_id,)
            )
            r = cur.fetchone()
            if not r:
                cur.close()
                conn.close()
                return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': [], 'total': 0, 'page': 1, 'per_page': 50})}

            item = {
                'id': r[0], 'category_id': r[1], 'name': r[2], 'article': r[3],
                'brand': r[4], 'supplier_code': r[5],
                'price_base': float(r[6]) if r[6] else None,
                'price_retail': float(r[7]) if r[7] else None,
                'price_wholesale': float(r[8]) if r[8] else None,
                'price_purchase': float(r[9]) if r[9] else None,
                'created_at': str(r[10]) if r[10] else None,
                'category_name': r[11],
                'images': [],
                'barcodes': []
            }
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': [item], 'total': 1, 'page': 1, 'per_page': 50})}

        category_id = params.get('category_id')
        search = params.get('search', '').strip()
        search_type = params.get('search_type', 'all')
        page = int(params.get('page', 1))
        per_page = int(params.get('per_page', 50))
        offset = (page - 1) * per_page

        conditions = []
        values = []

        if category_id:
            conditions.append("n.category_id = %s")
            values.append(int(category_id))

        if search:
            like = f"%{search}%"
            if search_type == 'article':
                conditions.append("n.article ILIKE %s")
                values.append(like)
            elif search_type == 'supplier_code':
                conditions.append("n.supplier_code ILIKE %s")
                values.append(like)
            else:
                conditions.append("(n.name ILIKE %s OR n.article ILIKE %s OR n.brand ILIKE %s OR n.supplier_code ILIKE %s)")
                values.extend([like, like, like, like])

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        price_purchase_col = "n.price_purchase" if is_owner else "NULL as price_purchase"

        cur.execute(f"SELECT COUNT(*) FROM nomenclature n {where}", values)
        total = cur.fetchone()[0]

        cur.execute(
            f"""SELECT n.id, n.category_id, n.name, n.article, n.brand, n.supplier_code,
                       n.price_base, n.price_retail, n.price_wholesale, {price_purchase_col},
                       n.created_at, c.name as category_name
                FROM nomenclature n
                JOIN categories c ON c.id = n.category_id
                {where}
                ORDER BY n.name
                LIMIT %s OFFSET %s""",
            values + [per_page, offset]
        )
        rows = cur.fetchall()

        nom_ids = [r[0] for r in rows]
        images_map = {}
        if nom_ids:
            placeholders = ','.join(['%s'] * len(nom_ids))
            cur.execute(
                f"""SELECT nomenclature_id, id, url, sort_order
                    FROM nomenclature_images
                    WHERE nomenclature_id IN ({placeholders})
                    ORDER BY sort_order""",
                nom_ids
            )
            for img in cur.fetchall():
                images_map.setdefault(img[0], []).append({'id': img[1], 'url': img[2], 'sort_order': img[3]})

        barcodes_map = {}
        if nom_ids:
            placeholders = ','.join(['%s'] * len(nom_ids))
            cur.execute(
                f"SELECT nomenclature_id, barcode FROM nomenclature_barcodes WHERE nomenclature_id IN ({placeholders}) ORDER BY id",
                nom_ids
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
                'images': images_map.get(r[0], []),
                'barcodes': barcodes_map.get(r[0], [])
            })

        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
            'items': items, 'total': total, 'page': page, 'per_page': per_page
        })}

    if method == 'POST':
        try:
            name = body.get('name', '').strip()
            category_id = body.get('category_id')
            article = body.get('article', '').strip() or None
            brand = body.get('brand', '').strip() or None
            supplier_code = body.get('supplier_code', '').strip() or None
            price_base = body.get('price_base')
            price_retail = body.get('price_retail')
            price_wholesale = body.get('price_wholesale')
            price_purchase = body.get('price_purchase')
            images_data = body.get('images', [])

            if not name or not category_id:
                cur.close()
                conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите название и категорию'})}

            cur.execute(
                """INSERT INTO nomenclature (category_id, name, article, brand, supplier_code,
                           price_base, price_retail, price_wholesale, price_purchase)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (category_id, name, article, brand, supplier_code,
                 price_base, price_retail, price_wholesale, price_purchase)
            )
            nom_id = cur.fetchone()[0]

            if images_data:
                s3 = get_s3()
                for i, img in enumerate(images_data):
                    url = upload_image(s3, img.get('data', ''), img.get('content_type', 'image/jpeg'))
                    cur.execute(
                        "INSERT INTO nomenclature_images (nomenclature_id, url, sort_order) VALUES (%s, %s, %s)",
                        (nom_id, url, i)
                    )

            barcodes_data = body.get('barcodes', [])
            for bc in barcodes_data:
                bc_val = bc.strip() if isinstance(bc, str) else str(bc).strip()
                if bc_val:
                    cur.execute(
                        "INSERT INTO nomenclature_barcodes (nomenclature_id, barcode) VALUES (%s, %s)",
                        (nom_id, bc_val)
                    )

            conn.commit()
            cur.close()
            conn.close()
            return {'statusCode': 201, 'headers': headers, 'body': json.dumps({'id': nom_id})}
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
        nom_id = params.get('id')
        if not nom_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id номенклатуры'})}

        name = body.get('name', '').strip()
        category_id = body.get('category_id')

        if not name or not category_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите название и категорию'})}

        cur.execute(
            """UPDATE nomenclature SET
                   name = %s, category_id = %s,
                   article = %s, brand = %s, supplier_code = %s,
                   price_base = %s, price_retail = %s, price_wholesale = %s, price_purchase = %s,
                   updated_at = NOW()
               WHERE id = %s RETURNING id""",
            (name, category_id,
             body.get('article', '').strip() or None,
             body.get('brand', '').strip() or None,
             body.get('supplier_code', '').strip() or None,
             body.get('price_base'), body.get('price_retail'),
             body.get('price_wholesale'), body.get('price_purchase'),
             nom_id)
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Номенклатура не найдена'})}

        new_images = body.get('images', [])
        if new_images:
            s3 = get_s3()
            for i, img in enumerate(new_images):
                url = upload_image(s3, img.get('data', ''), img.get('content_type', 'image/jpeg'))
                cur.execute(
                    "INSERT INTO nomenclature_images (nomenclature_id, url, sort_order) VALUES (%s, %s, %s)",
                    (nom_id, url, 100 + i)
                )

        remove_images = body.get('remove_images', [])
        if remove_images:
            placeholders = ','.join(['%s'] * len(remove_images))
            cur.execute(
                f"DELETE FROM nomenclature_images WHERE id IN ({placeholders}) AND nomenclature_id = %s",
                remove_images + [nom_id]
            )

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if method == 'DELETE':
        nom_id = params.get('id')
        if not nom_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id номенклатуры'})}

        cur.execute("DELETE FROM nomenclature_images WHERE nomenclature_id = %s", (nom_id,))
        cur.execute("DELETE FROM nomenclature WHERE id = %s", (nom_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}