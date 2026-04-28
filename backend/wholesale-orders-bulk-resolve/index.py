"""Массовый резолв артикулов для пакетного ввода позиций в заявку"""
import json
import os
import re
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

def check_condition(price_map, cond_field, cond_op, cond_val):
    if not cond_field or not cond_op or cond_val is None:
        return True
    price = float(price_map.get(cond_field) or 0)
    val = float(cond_val)
    if cond_op == '<': return price < val
    if cond_op == '>': return price > val
    if cond_op == '=': return price == val
    if cond_op == '<=': return price <= val
    if cond_op == '>=': return price >= val
    return True

def apply_formula(base, formula):
    for m in re.finditer(r'([+\-*/])\s*([\d.]+)', formula):
        v = float(m.group(2))
        op = m.group(1)
        if op == '*': base *= v
        elif op == '/': base = base / v if v else 0
        elif op == '+': base += v
        elif op == '-': base -= v
    return round(base, 2)

def calc_price(rules, price_map, product_group):
    matched = None
    for r in rules:
        if r[0] == 'product_group' and product_group == r[1]:
            if check_condition(price_map, r[4], r[5], r[6]):
                matched = r
                break
    if not matched:
        return float(price_map.get('price_wholesale') or 0)
    base = float(price_map.get(matched[2]) or 0)
    return apply_formula(base, matched[3])

def handler(event: dict, context) -> dict:
    """Резолв артикулов в товары + расчёт цены по правилам оптовика"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}

    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}

    body = json.loads(event.get('body') or '{}')
    articles_raw = body.get('articles') or []
    customer_name = body.get('customer_name') or ''
    search_in_names = bool(body.get('search_in_names'))

    if not isinstance(articles_raw, list):
        return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'articles должен быть массивом'})}

    req_headers = event.get('headers', {})
    auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()

    user = get_user_by_token(cur, token)
    if not user:
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    user_id, user_phone, user_role = user
    is_owner = user_role == 'owner'
    if not is_owner:
        mgr = get_manager_info(cur, user_phone)
        if not mgr:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет доступа'})}
        if mgr[2] not in ALLOWED_ROLES:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет доступа'})}

    articles_clean = []
    for a in articles_raw:
        if a is None:
            articles_clean.append('')
            continue
        s = str(a).strip()
        articles_clean.append(s)

    unique_queries = list({a.lower() for a in articles_clean if a})

    # Подстрочный поиск: для каждого запроса находим все товары, у которых
    # артикул содержит эту строку (или имя — если включён режим search_in_names).
    products_by_query = {q: [] for q in unique_queries}
    if unique_queries:
        for q in unique_queries:
            like_pattern = f"%{q}%"
            if search_in_names:
                cur.execute(
                    """SELECT id, name, article, price_base, price_retail, price_wholesale, price_purchase, product_group
                       FROM products
                       WHERE (lower(article) LIKE %s OR lower(name) LIKE %s)
                         AND COALESCE(is_archived, false) = false
                       LIMIT 50""",
                    (like_pattern, like_pattern)
                )
            else:
                cur.execute(
                    """SELECT id, name, article, price_base, price_retail, price_wholesale, price_purchase, product_group
                       FROM products
                       WHERE lower(article) LIKE %s
                         AND COALESCE(is_archived, false) = false
                       LIMIT 50""",
                    (like_pattern,)
                )
            for row in cur.fetchall():
                products_by_query[q].append({
                    'id': row[0], 'name': row[1], 'article': row[2],
                    'price_base': row[3], 'price_retail': row[4],
                    'price_wholesale': row[5], 'price_purchase': row[6],
                    'product_group': row[7]
                })

    rules = []
    if customer_name:
        cur.execute("SELECT id FROM wholesalers WHERE name = %s", (customer_name,))
        w = cur.fetchone()
        if w:
            cur.execute(
                """SELECT filter_type, filter_value, price_field, formula,
                          condition_price_field, condition_operator, condition_value
                   FROM pricing_rules WHERE wholesaler_id = %s ORDER BY priority""",
                (w[0],)
            )
            rules = cur.fetchall()

    def price_for(p):
        pm = {
            'price_base': p['price_base'], 'price_retail': p['price_retail'],
            'price_wholesale': p['price_wholesale'], 'price_purchase': p['price_purchase']
        }
        return calc_price(rules, pm, p['product_group'])

    # Поиск среди временных товаров для запросов, не нашедших ничего в products
    not_found_queries = [q for q in unique_queries if not products_by_query.get(q)]
    temps_by_query = {q: [] for q in not_found_queries}
    if not_found_queries:
        for q in not_found_queries:
            like_pattern = f"%{q}%"
            if search_in_names:
                cur.execute(
                    """SELECT id, brand, article, price
                       FROM temp_products
                       WHERE lower(article) LIKE %s OR lower(brand) LIKE %s
                       LIMIT 50""",
                    (like_pattern, like_pattern)
                )
            else:
                cur.execute(
                    """SELECT id, brand, article, price
                       FROM temp_products
                       WHERE lower(article) LIKE %s
                       LIMIT 50""",
                    (like_pattern,)
                )
            for row in cur.fetchall():
                temps_by_query[q].append({
                    'id': row[0], 'brand': row[1], 'article': row[2],
                    'price': float(row[3] or 0)
                })

    results = []
    for art in articles_clean:
        if not art:
            results.append({'article': art, 'status': 'empty'})
            continue
        matches = products_by_query.get(art.lower(), [])
        if len(matches) == 0:
            temp_matches = temps_by_query.get(art.lower(), [])
            if len(temp_matches) == 0:
                results.append({'article': art, 'status': 'not_found'})
            elif len(temp_matches) == 1:
                t = temp_matches[0]
                results.append({
                    'article': art, 'status': 'found',
                    'temp_product_id': t['id'],
                    'name': f"{t['brand']} {t['article']}",
                    'price': t['price'],
                    'is_temp': True
                })
            else:
                results.append({
                    'article': art, 'status': 'ambiguous',
                    'candidates': [
                        {'temp_product_id': t['id'], 'name': f"{t['brand']} {t['article']}",
                         'article': t['article'], 'price': t['price'], 'is_temp': True}
                        for t in temp_matches
                    ]
                })
        elif len(matches) == 1:
            p = matches[0]
            results.append({
                'article': art, 'status': 'found',
                'product_id': p['id'], 'name': p['name'],
                'price': price_for(p)
            })
        else:
            results.append({
                'article': art, 'status': 'ambiguous',
                'candidates': [
                    {'product_id': p['id'], 'name': p['name'], 'article': p['article'], 'price': price_for(p)}
                    for p in matches
                ]
            })

    cur.close(); conn.close()
    return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'results': results})}