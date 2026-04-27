"""CRUD платежей по заявкам + пересчёт статуса оплаты + зачёты возвратов"""
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

def get_manager_info(cur, phone):
    cur.execute(
        """SELECT m.id, m.role_id, r.name as role_name FROM managers m
           LEFT JOIN roles r ON r.id = m.role_id
           WHERE m.phone = %s AND m.status = 'authorized'""",
        (phone,)
    )
    return cur.fetchone()

ALLOWED_ROLES = ['Управляющий', 'Менеджер опта']
ALLOWED_METHODS = ['cash', 'card_transfer', 'bank_account', 'return_offset']

def calc_return_balance(cur, customer_name):
    """Доступная сумма зачёта по оптовику = сумма accepted возвратов − сумма уже зачтённых платежей"""
    cur.execute(
        "SELECT COALESCE(SUM(total_amount), 0) FROM wholesale_returns WHERE customer_name = %s AND status = 'accepted'",
        (customer_name,)
    )
    total_accepted = float(cur.fetchone()[0])
    cur.execute(
        """SELECT COALESCE(SUM(op.amount), 0)
           FROM order_payments op
           JOIN wholesale_returns r ON r.id = op.return_id
           WHERE r.customer_name = %s AND op.method = 'return_offset'""",
        (customer_name,)
    )
    used = float(cur.fetchone()[0])
    return max(0.0, round(total_accepted - used, 2))

def list_accepted_returns_with_balance(cur, customer_name):
    """Список accepted-возвратов оптовика с остатком по каждому"""
    cur.execute(
        """SELECT r.id, r.total_amount,
                  COALESCE((SELECT SUM(op.amount) FROM order_payments op
                            WHERE op.return_id = r.id AND op.method = 'return_offset'), 0) AS used
           FROM wholesale_returns r
           WHERE r.customer_name = %s AND r.status = 'accepted'
           ORDER BY r.accepted_at""",
        (customer_name,)
    )
    out = []
    for row in cur.fetchall():
        rid, total, used = row
        remaining = max(0.0, round(float(total) - float(used), 2))
        if remaining > 0:
            out.append({'id': rid, 'total': float(total), 'used': float(used), 'remaining': remaining})
    return out

def recalc_payment_status(cur, order_id):
    cur.execute("SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE order_id = %s", (order_id,))
    paid = float(cur.fetchone()[0])
    cur.execute("SELECT total_amount, status FROM wholesale_orders WHERE id = %s", (order_id,))
    row = cur.fetchone()
    total = float(row[0])
    current_status = row[1]

    if paid <= 0:
        ps = 'not_paid'
    elif paid < total:
        ps = 'partially_paid'
    else:
        ps = 'paid'

    final_status = current_status
    if current_status == 'shipped' and ps == 'paid':
        final_status = 'completed'
    elif current_status == 'completed' and ps != 'paid':
        final_status = 'shipped'

    cur.execute(
        "UPDATE wholesale_orders SET payment_status = %s, paid_amount = %s, status = %s WHERE id = %s",
        (ps, paid, final_status, order_id)
    )
    return ps, paid

def handler(event: dict, context) -> dict:
    """CRUD платежей по заявкам + расчёт доступной суммы зачёта возвратов"""
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

    user_id, user_phone, user_role = user
    is_owner = user_role == 'owner'

    if not is_owner:
        mgr = get_manager_info(cur, user_phone)
        if not mgr or mgr[2] not in ALLOWED_ROLES:
            cur.close()
            conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет доступа'})}

    order_id = params.get('order_id')
    if not order_id:
        cur.close()
        conn.close()
        return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан order_id'})}

    cur.execute("SELECT id, total_amount, payment_status, paid_amount, customer_name FROM wholesale_orders WHERE id = %s", (order_id,))
    order = cur.fetchone()
    if not order:
        cur.close()
        conn.close()
        return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Заявка не найдена'})}

    customer_name = order[4]

    if method == 'GET':
        # Эндпоинт расчёта доступной суммы зачёта
        if params.get('action') == 'return_balance':
            balance = calc_return_balance(cur, customer_name)
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': headers,
                    'body': json.dumps({'balance': balance, 'customer_name': customer_name})}

        cur.execute(
            """SELECT id, amount, method, comment, created_at, return_id
               FROM order_payments WHERE order_id = %s ORDER BY created_at""",
            (order_id,)
        )
        payments = []
        for r in cur.fetchall():
            payments.append({
                'id': r[0], 'amount': float(r[1]), 'method': r[2],
                'comment': r[3], 'created_at': str(r[4]),
                'return_id': r[5]
            })
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
            'payments': payments,
            'total_amount': float(order[1]),
            'payment_status': order[2],
            'paid_amount': float(order[3]),
            'customer_name': customer_name
        })}

    if method == 'POST':
        amount = body.get('amount')
        pay_method = body.get('method')
        comment = body.get('comment', '').strip() or None

        if not amount or float(amount) <= 0:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите сумму'})}
        if pay_method not in ALLOWED_METHODS:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Неверный способ оплаты'})}

        amount_f = float(amount)
        return_ref_id = None

        if pay_method == 'return_offset':
            # Блокируем строки возвратов оптовика, пересчитываем баланс под FOR UPDATE
            cur.execute(
                "SELECT id FROM wholesale_returns WHERE customer_name = %s AND status = 'accepted' FOR UPDATE",
                (customer_name,)
            )
            cur.fetchall()
            balance = calc_return_balance(cur, customer_name)
            if balance <= 0:
                cur.close()
                conn.close()
                return {'statusCode': 400, 'headers': headers,
                        'body': json.dumps({'error': 'Нет доступной суммы зачёта по этому оптовику'})}
            if amount_f > balance + 0.001:
                cur.close()
                conn.close()
                return {'statusCode': 400, 'headers': headers,
                        'body': json.dumps({'error': f'Сумма превышает доступный остаток зачёта ({balance:.2f} Br)'})}

            # Списываем по возвратам в порядке FIFO, но в одну запись платежа со ссылкой на первый затронутый возврат
            returns_list = list_accepted_returns_with_balance(cur, customer_name)
            remaining_to_apply = amount_f
            first_return_id = None
            for ret in returns_list:
                if remaining_to_apply <= 0:
                    break
                take = min(ret['remaining'], remaining_to_apply)
                if take <= 0:
                    continue
                first_return_id = ret['id']
                # Создаём отдельный платёж под каждый затронутый возврат — упрощает учёт зачёта
                cur.execute(
                    """INSERT INTO order_payments (order_id, amount, method, comment, return_id)
                       VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                    (order_id, take, pay_method, comment, ret['id'])
                )
                remaining_to_apply = round(remaining_to_apply - take, 2)
            payment_id = first_return_id  # возвращаем как "ссылку"
            return_ref_id = first_return_id
        else:
            cur.execute(
                """INSERT INTO order_payments (order_id, amount, method, comment, return_id)
                   VALUES (%s, %s, %s, %s, NULL) RETURNING id""",
                (order_id, amount_f, pay_method, comment)
            )
            payment_id = cur.fetchone()[0]

        ps, paid = recalc_payment_status(cur, order_id)

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 201, 'headers': headers, 'body': json.dumps({
            'id': payment_id, 'payment_status': ps, 'paid_amount': paid, 'return_id': return_ref_id
        })}

    if method == 'DELETE':
        payment_id = params.get('payment_id')
        if not payment_id:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Не указан payment_id'})}

        cur.execute("SELECT id FROM order_payments WHERE id = %s AND order_id = %s", (payment_id, order_id))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Платёж не найден'})}

        cur.execute("DELETE FROM order_payments WHERE id = %s", (payment_id,))
        ps, paid = recalc_payment_status(cur, order_id)

        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
            'ok': True, 'payment_status': ps, 'paid_amount': paid
        })}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}
