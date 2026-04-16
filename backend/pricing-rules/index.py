"""CRUD правил ценообразования для оптовиков"""
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

HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

def resp(status, body):
    return {'statusCode': status, 'headers': HEADERS, 'body': json.dumps(body, default=str)}

def handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': ''}

    token = (event.get('headers') or {}).get('X-Authorization', '').replace('Bearer ', '')
    if not token:
        token = (event.get('headers') or {}).get('x-authorization', '').replace('Bearer ', '')
    if not token:
        return resp(401, {'error': 'Не авторизован'})

    conn = get_db()
    cur = conn.cursor()
    user = get_user_by_token(cur, token)
    if not user:
        cur.close(); conn.close()
        return resp(401, {'error': 'Не авторизован'})

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}

    if method == 'GET':
        wholesaler_id = params.get('wholesaler_id')
        if not wholesaler_id:
            cur.close(); conn.close()
            return resp(400, {'error': 'wholesaler_id обязателен'})

        cur.execute(
            """SELECT id, wholesaler_id, priority, filter_type, filter_value, price_field, formula, created_at,
                      condition_price_field, condition_operator, condition_value
               FROM pricing_rules WHERE wholesaler_id = %s ORDER BY priority""",
            (wholesaler_id,)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        return resp(200, {'items': [
            {'id': r[0], 'wholesaler_id': r[1], 'priority': r[2], 'filter_type': r[3],
             'filter_value': r[4], 'price_field': r[5], 'formula': r[6], 'created_at': r[7],
             'condition_price_field': r[8], 'condition_operator': r[9],
             'condition_value': float(r[10]) if r[10] is not None else None}
            for r in rows
        ]})

    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        wholesaler_id = body.get('wholesaler_id')
        filter_type = body.get('filter_type', 'product_group')
        filter_value = (body.get('filter_value') or '').strip()
        price_field = body.get('price_field', 'price_base')
        formula = (body.get('formula') or '').strip()
        cond_field = body.get('condition_price_field') or None
        cond_op = body.get('condition_operator') or None
        cond_val = body.get('condition_value')
        if cond_val is not None and cond_val != '':
            cond_val = float(cond_val)
        else:
            cond_val = None

        if not wholesaler_id or not filter_value or not formula:
            cur.close(); conn.close()
            return resp(400, {'error': 'wholesaler_id, filter_value, formula обязательны'})

        allowed_fields = ('price_base', 'price_retail', 'price_wholesale', 'price_purchase')
        if price_field not in allowed_fields:
            cur.close(); conn.close()
            return resp(400, {'error': f'price_field должен быть одним из: {", ".join(allowed_fields)}'})

        cur.execute("SELECT COALESCE(MAX(priority), 0) + 1 FROM pricing_rules WHERE wholesaler_id = %s", (wholesaler_id,))
        next_priority = cur.fetchone()[0]

        cur.execute(
            """INSERT INTO pricing_rules (wholesaler_id, priority, filter_type, filter_value, price_field, formula,
                                          condition_price_field, condition_operator, condition_value)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (wholesaler_id, next_priority, filter_type, filter_value, price_field, formula, cond_field, cond_op, cond_val)
        )
        rule_id = cur.fetchone()[0]
        conn.commit()
        cur.close(); conn.close()
        return resp(201, {'id': rule_id, 'priority': next_priority})

    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        rule_id = body.get('id')
        if not rule_id:
            cur.close(); conn.close()
            return resp(400, {'error': 'id обязателен'})

        action = body.get('action')
        if action == 'reorder':
            rules = body.get('rules', [])
            for i, rid in enumerate(rules):
                cur.execute("UPDATE pricing_rules SET priority = %s WHERE id = %s", (i, rid))
            conn.commit()
            cur.close(); conn.close()
            return resp(200, {'ok': True})

        fields = {}
        for f in ('filter_type', 'filter_value', 'price_field', 'formula',
                  'condition_price_field', 'condition_operator', 'condition_value'):
            if f in body:
                val = body[f]
                if f == 'condition_value' and val is not None and val != '':
                    val = float(val)
                elif f == 'condition_value':
                    val = None
                if f in ('condition_price_field', 'condition_operator') and val == '':
                    val = None
                fields[f] = val
        if fields:
            sets = ', '.join(f"{k} = %s" for k in fields)
            cur.execute(f"UPDATE pricing_rules SET {sets} WHERE id = %s", (*fields.values(), rule_id))
            conn.commit()
        cur.close(); conn.close()
        return resp(200, {'ok': True})

    if method == 'DELETE':
        rule_id = params.get('id')
        if not rule_id:
            cur.close(); conn.close()
            return resp(400, {'error': 'id обязателен'})
        cur.execute("DELETE FROM pricing_rules WHERE id = %s", (rule_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {'ok': True})

    cur.close(); conn.close()
    return resp(405, {'error': 'Method not allowed'})