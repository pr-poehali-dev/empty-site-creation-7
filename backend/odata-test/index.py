"""Тесты обмена с 1С через OData: связь, поиск номенклатуры, создание и удаление пробных документов"""
import json
import os
import base64
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}

EMPTY_GUID = '00000000-0000-0000-0000-000000000000'

DOC_TYPES = {
    'supplier_invoice': 'Document_СчетНаОплатуПоставщика',
    'goods_receipt': 'Document_ПоступлениеТоваровУслуг',
    'customer_invoice': 'Document_СчетНаОплатуПокупателю',
    'goods_sale': 'Document_РеализацияТоваровУслуг',
}


def resp(status, data):
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(data, ensure_ascii=False)}


def get_token(event):
    headers = event.get('headers', {}) or {}
    auth = headers.get('X-Authorization') or headers.get('Authorization') or ''
    return auth.replace('Bearer ', '').strip()


def check_owner(token):
    if not token:
        return False
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT u.role FROM users u
               JOIN user_sessions s ON s.user_id = u.id
               WHERE s.token = %s AND s.expires_at > NOW()""",
            (token,)
        )
        row = cur.fetchone()
        return bool(row and row[0] == 'owner')
    finally:
        conn.close()


BASES = {
    'trade-resurs': '',
    'fomkin': '_FOMKIN',
    'mirtehniki': '_MIRTEH',
}


def odata_config(base='trade-resurs'):
    suffix = BASES.get(base)
    if suffix is None:
        return None
    url = (os.environ.get(f'ODATA_URL{suffix}') or '').strip()
    user = (os.environ.get(f'ODATA_USER{suffix}') or '').strip()
    password = os.environ.get(f'ODATA_PASSWORD{suffix}') or ''
    if not url or not user or not password:
        return None
    if not url.endswith('/'):
        url += '/'
    return {'url': url, 'user': user, 'password': password}


def encode_path(path):
    return urllib.parse.quote(path, safe="/?&=$',()[]:*+.~-_")


def call_odata(cfg, path, method='GET', payload=None, raw=False):
    full = cfg['url'] + encode_path(path)
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(full, data=data, method=method)
    token = base64.b64encode(f"{cfg['user']}:{cfg['password']}".encode('utf-8')).decode('ascii')
    req.add_header('Authorization', f'Basic {token}')
    req.add_header('Accept', 'application/json')
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode('utf-8', errors='replace')
            if raw or not body:
                return {'ok': True, 'status': r.status, 'text': body}
            return {'ok': True, 'status': r.status, 'data': json.loads(body)}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        return {'ok': False, 'status': e.code, 'error': parse_1c_error(body, e.code)}
    except urllib.error.URLError as e:
        return {'ok': False, 'status': 0, 'error': f'Не удалось соединиться с 1С: {e.reason}'}
    except Exception as e:
        return {'ok': False, 'status': 0, 'error': str(e)}


def parse_1c_error(body, code):
    try:
        parsed = json.loads(body)
        err = parsed.get('odata.error') or parsed.get('error') or {}
        msg = err.get('message')
        if isinstance(msg, dict):
            msg = msg.get('value')
        if msg:
            return msg
    except Exception:
        pass
    text = (body or '').strip()
    if not text:
        return f'1С вернула код {code} без пояснения'
    return text[:1500]


def ping(cfg):
    r = call_odata(cfg, '?$format=json')
    if not r['ok']:
        return {'ok': False, 'error': r['error'], 'status': r['status']}
    data = r.get('data') or {}
    sets = sorted(
        item.get('name') or item.get('url') or ''
        for item in data.get('value', [])
    )
    sets = [s for s in sets if s]
    return {'ok': True, 'entity_count': len(sets), 'entities': sets[:400]}


def load_refs(cfg):
    out = {}
    orgs = call_odata(cfg, 'Catalog_Организации?$format=json&$select=Ref_Key,Description,DeletionMark')
    if orgs['ok']:
        out['organizations'] = [
            {'key': o.get('Ref_Key'), 'name': o.get('Description')}
            for o in orgs['data'].get('value', []) if not o.get('DeletionMark')
        ]
    else:
        out['organizations_error'] = orgs['error']
    whs = call_odata(cfg, 'Catalog_Склады?$format=json&$select=Ref_Key,Description,DeletionMark')
    if whs['ok']:
        out['warehouses'] = [
            {'key': w.get('Ref_Key'), 'name': w.get('Description')}
            for w in whs['data'].get('value', []) if not w.get('DeletionMark')
        ]
    else:
        out['warehouses_error'] = whs['error']
    return out


def find_product(cfg, article):
    article = (article or '').strip()
    if not article:
        return {'ok': False, 'error': 'Не указан артикул'}
    safe = article.replace("'", "''")
    query = (
        "Catalog_Номенклатура?$format=json&$top=20"
        "&$select=Ref_Key,Code,Description,Артикул,DeletionMark,IsFolder"
        f"&$filter=Артикул eq '{safe}' and IsFolder eq false"
    )
    r = call_odata(cfg, query)
    if not r['ok']:
        return {'ok': False, 'error': r['error']}
    items = [
        {
            'key': i.get('Ref_Key'),
            'code': i.get('Code'),
            'name': i.get('Description'),
            'article': i.get('Артикул'),
            'deleted': i.get('DeletionMark'),
        }
        for i in r['data'].get('value', [])
    ]
    return {'ok': True, 'items': items, 'count': len(items)}


def match_products(cfg, rows):
    """Ищет товары по артикулу, затем по штрихкоду. Возвращает результат по каждой строке."""
    articles = [str(r.get('article') or '').strip() for r in rows]
    unique = sorted({a for a in articles if a})

    found = {}
    chunk = 40
    for i in range(0, len(unique), chunk):
        part = unique[i:i + chunk]
        cond = ' or '.join(f"Артикул eq '{a}'" for a in part)
        q = (
            "Catalog_Номенклатура?$format=json"
            "&$select=Ref_Key,Code,Description,Артикул"
            f"&$filter=({cond}) and IsFolder eq false and DeletionMark eq false"
        )
        r = call_odata(cfg, q)
        if not r['ok']:
            return {'ok': False, 'error': r['error']}
        for item in r['data'].get('value', []):
            art = str(item.get('Артикул') or '').strip()
            if art and art not in found:
                found[art] = {
                    'key': item.get('Ref_Key'),
                    'code': item.get('Code'),
                    'name': item.get('Description'),
                }

    result = []
    for r in rows:
        art = str(r.get('article') or '').strip()
        hit = found.get(art)
        result.append({
            'article': art,
            'found': bool(hit),
            'key': hit['key'] if hit else None,
            'name_1c': hit['name'] if hit else None,
            'code': hit['code'] if hit else None,
        })
    return {'ok': True, 'items': result, 'found': sum(1 for x in result if x['found']), 'total': len(result)}


def create_supplier_invoice(cfg, payload):
    """Создаёт счёт на оплату поставщика со строками товаров. Без НДС, без контрагента."""
    org_key = payload.get('organization_key')
    rows = payload.get('rows') or []
    if not rows:
        return {'ok': False, 'error': 'Нет строк товаров'}

    goods = []
    line = 0
    for r in rows:
        key = r.get('key')
        if not key:
            return {'ok': False, 'error': f"Не найден товар с артикулом {r.get('article')}"}
        line += 1
        qty = float(r.get('quantity') or 0)
        price = float(r.get('price') or 0)
        amount = round(qty * price, 2)
        goods.append({
            'LineNumber': str(line),
            'Номенклатура_Key': key,
            'Количество': qty,
            'Цена': price,
            'Сумма': amount,
            'СтавкаНДС': 'БезНДС',
            'СуммаНДС': 0,
            'Всего': amount,
        })

    doc = {
        'Date': payload.get('date') or datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        'Posted': False,
        'Контрагент_Key': EMPTY_GUID,
        'ДоговорКонтрагента_Key': EMPTY_GUID,
        'СуммаДокумента': round(sum(g['Всего'] for g in goods), 2),
        'Запасы': goods,
    }
    if org_key:
        doc['Организация_Key'] = org_key
    if payload.get('comment'):
        doc['Комментарий'] = payload['comment']

    r = call_odata(cfg, 'Document_СчетНаОплатуПоставщика?$format=json', method='POST', payload=doc)
    if not r['ok']:
        return {'ok': False, 'error': r['error'], 'sent_head': {k: v for k, v in doc.items() if k != 'Запасы'},
                'sent_line': goods[0] if goods else None}
    d = r['data']
    return {
        'ok': True,
        'entity': 'Document_СчетНаОплатуПоставщика',
        'key': d.get('Ref_Key'),
        'number': d.get('Number'),
        'date': d.get('Date'),
        'lines': len(goods),
        'amount': doc['СуммаДокумента'],
    }


def create_doc(cfg, doc_kind, org_key, warehouse_key):
    entity = DOC_TYPES.get(doc_kind)
    if not entity:
        return {'ok': False, 'error': 'Неизвестный тип документа'}
    payload = {
        'Date': datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        'Posted': False,
    }
    if org_key:
        payload['Организация_Key'] = org_key
    if warehouse_key and doc_kind in ('goods_receipt', 'goods_sale'):
        payload['Склад_Key'] = warehouse_key
    payload['Контрагент_Key'] = EMPTY_GUID
    payload['ДоговорКонтрагента_Key'] = EMPTY_GUID

    r = call_odata(cfg, f'{entity}?$format=json', method='POST', payload=payload)
    if not r['ok']:
        return {'ok': False, 'error': r['error'], 'sent': payload}
    d = r['data']
    return {
        'ok': True,
        'entity': entity,
        'key': d.get('Ref_Key'),
        'number': d.get('Number'),
        'date': d.get('Date'),
        'posted': d.get('Posted'),
    }


def create_product(cfg):
    stamp = datetime.now().strftime('%d.%m %H:%M:%S')
    payload = {
        'Description': f'Тестовый товар {stamp}',
        'Артикул': 'TEST-' + datetime.now().strftime('%H%M%S'),
        'IsFolder': False,
    }
    r = call_odata(cfg, 'Catalog_Номенклатура?$format=json', method='POST', payload=payload)
    if not r['ok']:
        return {'ok': False, 'error': r['error'], 'sent': payload}
    d = r['data']
    return {
        'ok': True,
        'entity': 'Catalog_Номенклатура',
        'key': d.get('Ref_Key'),
        'number': d.get('Code'),
        'name': d.get('Description'),
    }


def mark_deleted(cfg, entity, key):
    if not entity or not key:
        return {'ok': False, 'error': 'Не указан объект для удаления'}
    r = call_odata(
        cfg, f"{entity}(guid'{key}')?$format=json",
        method='PATCH', payload={'DeletionMark': True}
    )
    if not r['ok']:
        return {'ok': False, 'error': r['error']}
    return {'ok': True, 'mode': 'mark'}


def hard_delete(cfg, entity, key):
    if not entity or not key:
        return {'ok': False, 'error': 'Не указан объект для удаления'}
    r = call_odata(cfg, f"{entity}(guid'{key}')", method='DELETE', raw=True)
    if not r['ok']:
        return {'ok': False, 'error': r['error']}
    return {'ok': True, 'mode': 'hard'}


def handler(event: dict, context) -> dict:
    """Тесты обмена с 1С по OData: проверка связи, поиск номенклатуры, создание и удаление пробных документов. Только для владельца."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')
    action = params.get('action') or body.get('action') or ''

    if not check_owner(get_token(event)):
        return resp(401, {'error': 'Доступ только для владельца'})

    base = params.get('base') or body.get('base') or 'trade-resurs'

    if action == 'bases':
        return resp(200, {'bases': {
            key: bool(odata_config(key)) for key in BASES
        }})

    cfg = odata_config(base)
    if not cfg:
        return resp(200, {'configured': False, 'error': 'Не заданы адрес, логин или пароль доступа к этой базе 1С'})

    if action == 'ping':
        return resp(200, {'configured': True, 'result': ping(cfg)})

    if action == 'refs':
        return resp(200, {'configured': True, 'result': load_refs(cfg)})

    if action == 'find_product':
        return resp(200, {'result': find_product(cfg, params.get('article') or body.get('article'))})

    if action == 'create_doc':
        return resp(200, {'result': create_doc(
            cfg, body.get('kind'), body.get('organization_key'), body.get('warehouse_key')
        )})

    if action == 'match_products':
        return resp(200, {'result': match_products(cfg, body.get('rows') or [])})

    if action == 'create_supplier_invoice':
        return resp(200, {'result': create_supplier_invoice(cfg, body)})

    if action == 'create_product':
        return resp(200, {'result': create_product(cfg)})

    if action == 'delete':
        entity = body.get('entity')
        key = body.get('key')
        if body.get('hard'):
            return resp(200, {'result': hard_delete(cfg, entity, key)})
        return resp(200, {'result': mark_deleted(cfg, entity, key)})

    return resp(400, {'error': 'Неизвестное действие'})