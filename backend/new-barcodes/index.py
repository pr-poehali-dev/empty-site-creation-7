"""Новые штрихкоды: сохранение и управление неизвестными штрихкодами"""
import json
import os
import psycopg2


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


def get_manager_id(cur, phone):
    cur.execute("SELECT id FROM managers WHERE phone = %s", (phone,))
    row = cur.fetchone()
    return row[0] if row else None


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    if method == 'GET':
        show_removed = params.get('removed', '0') == '1'
        page = int(params.get('page', 1))
        per_page = int(params.get('per_page', 50))
        offset = (page - 1) * per_page

        where = "WHERE is_removed = TRUE" if show_removed else "WHERE is_removed = FALSE"

        cur.execute(f"SELECT COUNT(*) FROM new_barcodes {where}")
        total = cur.fetchone()[0]

        cur.execute(
            f"""SELECT nb.id, nb.barcode, nb.nomenclature_id,
                       p.name as product_name, p.article as product_article,
                       nb.confirmed, nb.is_removed, nb.created_by, nb.created_at
                FROM new_barcodes nb
                LEFT JOIN products p ON p.id = nb.nomenclature_id
                {where}
                ORDER BY nb.created_at DESC
                LIMIT %s OFFSET %s""",
            (per_page, offset)
        )
        rows = cur.fetchall()
        items = []
        for r in rows:
            p_name = r[3]
            p_article = r[4]
            if not p_name and r[1]:
                cur.execute("SELECT brand, article FROM temp_products WHERE barcode = %s LIMIT 1", (r[1],))
                tp = cur.fetchone()
                if tp:
                    p_name = f"{tp[0]} {tp[1]}"
                    p_article = tp[1]
            items.append({
                'id': r[0], 'barcode': r[1], 'nomenclature_id': r[2],
                'product_name': p_name, 'product_article': p_article,
                'confirmed': r[5], 'is_removed': r[6],
                'created_by': r[7],
                'created_at': str(r[8]) if r[8] else None
            })

        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'items': items, 'total': total, 'page': page, 'per_page': per_page})}

    if method == 'POST':
        barcode = (body.get('barcode') or '').strip()
        nomenclature_id = body.get('nomenclature_id')
        save_to_product = body.get('save_to_product', False)

        if not barcode:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'barcode обязателен'})}

        manager_id = get_manager_id(cur, user[1])

        cur.execute(
            """INSERT INTO new_barcodes (barcode, nomenclature_id, confirmed, created_by)
               VALUES (%s, %s, %s, %s)
               RETURNING id""",
            (barcode, nomenclature_id, bool(save_to_product), manager_id)
        )
        new_id = cur.fetchone()[0]

        if save_to_product and nomenclature_id:
            cur.execute(
                "INSERT INTO product_barcodes (product_id, barcode) VALUES (%s, %s)",
                (nomenclature_id, barcode)
            )

        conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'id': new_id, 'ok': True})}

    if method == 'PUT':
        item_id = params.get('id')
        if not item_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'id обязателен'})}

        updates = []
        args = []

        if 'is_removed' in body:
            updates.append("is_removed = %s"); args.append(bool(body['is_removed']))
        if 'confirmed' in body:
            updates.append("confirmed = %s"); args.append(bool(body['confirmed']))
        if 'nomenclature_id' in body:
            updates.append("nomenclature_id = %s"); args.append(body['nomenclature_id'])

        if not updates:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нет данных для обновления'})}

        args.append(item_id)
        cur.execute(f"UPDATE new_barcodes SET {', '.join(updates)} WHERE id = %s", args)

        if body.get('is_removed'):
            cur.execute("SELECT barcode FROM new_barcodes WHERE id = %s", (item_id,))
            bc_row = cur.fetchone()
            if bc_row and bc_row[0]:
                cur.execute("UPDATE temp_products SET barcode = NULL WHERE barcode = %s", (bc_row[0],))

        conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}