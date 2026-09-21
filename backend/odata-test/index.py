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


INCOMING_NUMBER_FIELDS = ['ВходящийНомер', 'НомерВходящегоДокумента', 'НомерДокументаПоставщика', 'ВходящийДокументНомер']
INCOMING_DATE_FIELDS = ['ВходящаяДата', 'ДатаВходящегоДокумента', 'ДатаДокументаПоставщика', 'ВходящийДокументДата']


GOODS_TABLE_NAMES = ['Товары', 'ТоварыУслуги', 'Запасы', 'ТоварыИУслуги', 'Номенклатура', 'Состав']

ITEM_FIELD_NAMES = ['Номенклатура_Key', 'Номенклатура']
QTY_FIELD_NAMES = ['Количество', 'КоличествоУпаковок']
PRICE_FIELD_NAMES = ['Цена']
AMOUNT_FIELD_NAMES = ['Сумма']
VAT_RATE_FIELD_NAMES = ['СтавкаНДС']
VAT_AMOUNT_FIELD_NAMES = ['СуммаНДС']
TOTAL_FIELD_NAMES = ['Всего', 'СуммаСНДС']

VAT_IN_SUM_FIELDS = ['СуммаВключаетНДС', 'ЦенаВключаетНДС', 'НДСВключенВСтоимость', 'УчитыватьНДС']

COUNTRY_FIELD_NAMES = ['СтранаПроисхождения_Key', 'СтранаПроисхождения']
GTD_FIELD_NAMES = ['НомерГТД_Key', 'НомерГТД', 'ТаможеннаяДекларация_Key']
RNPT_FIELD_NAMES = ['НомерРНПТ', 'РНПТ', 'РегистрационныйНомерПартииТовара']

VAT_RATES = {
    '22': {'name': 'НДС22', 'percent': 22},
    '20': {'name': 'НДС20', 'percent': 20},
    '10': {'name': 'НДС10', 'percent': 10},
    '5': {'name': 'НДС5', 'percent': 5},
    '0': {'name': 'НДС0', 'percent': 0},
    'none': {'name': 'БезНДС', 'percent': 0},
}


def doc_schema(cfg, entity):
    """Читает существующий документ вместе с табличными частями, чтобы узнать реальные имена."""
    tables = [t for t in GOODS_TABLE_NAMES]
    expand = ','.join(tables)
    r = call_odata(cfg, f'{entity}?$top=1&$format=json&$expand={expand}')
    if not r['ok']:
        r = call_odata(cfg, f'{entity}?$top=1&$format=json')
        if not r['ok']:
            return {'fields': [], 'table': None, 'columns': []}
    rows = r['data'].get('value') or []
    if not rows:
        return {'fields': [], 'table': None, 'columns': []}
    doc = rows[0]
    fields = list(doc.keys())

    table = None
    columns = []
    for name in GOODS_TABLE_NAMES:
        val = doc.get(name)
        if isinstance(val, list):
            table = name
            if val:
                columns = list(val[0].keys())
            break
    if table is None:
        for name, val in doc.items():
            if isinstance(val, list) and val and isinstance(val[0], dict):
                if any('Номенклатура' in k for k in val[0]):
                    table = name
                    columns = list(val[0].keys())
                    break
    return {'fields': fields, 'table': table, 'columns': columns}


def doc_field_names(cfg, entity):
    return doc_schema(cfg, entity)['fields']


def pick(candidates, available, default=None):
    for c in candidates:
        if not available or c in available:
            return c
    return default


def prefetch_countries(cfg, names):
    """Разом читает все нужные страны одним запросом вместо запроса на строку."""
    uniq = sorted({(n or '').strip().upper() for n in names if (n or '').strip()})
    cache = {}
    chunk = 30
    for i in range(0, len(uniq), chunk):
        part = uniq[i:i + chunk]
        cond = ' or '.join(
            "toupper(Description) eq '{}'".format(p.replace("'", "''")) for p in part
        )
        r = call_odata(cfg, f"Catalog_СтраныМира?$format=json&$select=Ref_Key,Description&$filter={cond}")
        if not r['ok']:
            continue
        for item in r['data'].get('value', []):
            key = str(item.get('Description') or '').strip().upper()
            if key:
                cache[key] = item.get('Ref_Key')
    return cache


def prefetch_gtd(cfg, numbers):
    """Разом читает все номера ГТД одним запросом."""
    uniq = sorted({(n or '').strip() for n in numbers if (n or '').strip()})
    cache = {}
    chunk = 30
    for i in range(0, len(uniq), chunk):
        part = uniq[i:i + chunk]
        cond = ' or '.join(
            "Description eq '{}'".format(p.replace("'", "''")) for p in part
        )
        r = call_odata(cfg, f"Catalog_НомераГТД?$format=json&$select=Ref_Key,Description&$filter={cond}")
        if not r['ok']:
            continue
        for item in r['data'].get('value', []):
            key = str(item.get('Description') or '').strip()
            if key:
                cache[key] = item.get('Ref_Key')
    return cache


def find_country(cfg, name, cache):
    """Ищет страну в справочнике «Страны мира» по названию."""
    key = (name or '').strip().upper()
    if not key:
        return None
    return cache.get(key)


def find_or_create_gtd(cfg, number, cache):
    """Ищет номер ГТД, при отсутствии — создаёт новый элемент справочника."""
    key = (number or '').strip()
    if not key:
        return None, None
    if cache.get(key):
        return cache[key], None

    c = call_odata(cfg, 'Catalog_НомераГТД?$format=json', method='POST',
                   payload={'Description': key})
    if c['ok']:
        cache[key] = c['data'].get('Ref_Key')
        return cache[key], 'created'
    cache[key] = None
    return None, c['error']


def create_supplier_invoice(cfg, payload, entity='Document_СчетНаОплатуПоставщика'):
    """Создаёт счёт поставщика или поступление товаров со строками. Без контрагента, непроведённый."""
    org_key = payload.get('organization_key')
    rows = payload.get('rows') or []
    if not rows:
        return {'ok': False, 'error': 'Нет строк товаров'}

    is_receipt = entity == 'Document_ПоступлениеТоваровУслуг'
    schema = doc_schema(cfg, entity)
    fields = schema['fields']
    table = schema['table']
    cols = schema['columns']

    if not table:
        return {
            'ok': False,
            'error': 'Не удалось определить, как называется таблица товаров в документе. '
                     'Доступные реквизиты: ' + ', '.join(fields[:60]),
        }

    f_item = pick(ITEM_FIELD_NAMES, cols, 'Номенклатура_Key')
    f_qty = pick(QTY_FIELD_NAMES, cols, 'Количество')
    f_price = pick(PRICE_FIELD_NAMES, cols, 'Цена')
    f_amount = pick(AMOUNT_FIELD_NAMES, cols, 'Сумма')
    f_vat_rate = pick(VAT_RATE_FIELD_NAMES, cols)
    f_vat_sum = pick(VAT_AMOUNT_FIELD_NAMES, cols)
    f_total = pick(TOTAL_FIELD_NAMES, cols)

    f_country = pick(COUNTRY_FIELD_NAMES, cols) if is_receipt else None
    f_gtd = pick(GTD_FIELD_NAMES, cols) if is_receipt else None
    f_rnpt = pick(RNPT_FIELD_NAMES, cols) if is_receipt else None
    country_cache = prefetch_countries(cfg, [r.get('country') for r in rows]) if f_country else {}
    gtd_cache = prefetch_gtd(cfg, [r.get('gtd') for r in rows]) if f_gtd else {}
    notes = []

    vat_key = str(payload.get('vat_rate') or 'none')
    vat = VAT_RATES.get(vat_key) or VAT_RATES['none']
    percent = vat['percent']

    goods = []
    line = 0
    total_vat = 0.0
    for r in rows:
        key = r.get('key')
        if not key:
            return {'ok': False, 'error': f"Не найден товар с артикулом {r.get('article')}"}
        line += 1
        qty = float(r.get('quantity') or 0)
        price = float(r.get('price') or 0)
        amount = round(qty * price, 2)
        vat_sum = round(amount * percent / (100 + percent), 2) if percent else 0
        total_vat += vat_sum
        row = {
            'LineNumber': str(line),
            f_item: key,
            f_qty: qty,
            f_price: price,
            f_amount: amount,
        }
        if f_vat_rate:
            row[f_vat_rate] = vat['name']
        if f_vat_sum:
            row[f_vat_sum] = vat_sum
        if f_total:
            row[f_total] = amount

        if is_receipt:
            if f_country and r.get('country'):
                ck = find_country(cfg, r['country'], country_cache)
                if ck:
                    row[f_country] = ck
                else:
                    notes.append(f"Страна «{r['country']}» не найдена в справочнике")
            if f_gtd and r.get('gtd'):
                gk, info = find_or_create_gtd(cfg, r['gtd'], gtd_cache)
                if gk:
                    row[f_gtd] = gk
                    if info == 'created':
                        notes.append(f"Номер ГТД {r['gtd']} создан в справочнике")
                elif info:
                    notes.append(f"Номер ГТД {r['gtd']} не записан: {info}")
            if f_rnpt and r.get('rnpt'):
                row[f_rnpt] = str(r['rnpt']).strip()

        goods.append(row)

    doc_date = payload.get('date') or datetime.now().strftime('%Y-%m-%dT%H:%M:%S')

    doc = {
        'Date': doc_date,
        'Posted': False,
        'Контрагент_Key': EMPTY_GUID,
        'ДоговорКонтрагента_Key': EMPTY_GUID,
        'СуммаДокумента': round(sum(g[f_amount] for g in goods), 2),
        table: goods,
    }
    if org_key:
        doc['Организация_Key'] = org_key

    wh_key = payload.get('warehouse_key')
    if is_receipt and wh_key and 'Склад_Key' in fields:
        doc['Склад_Key'] = wh_key

    used = {'table': table, 'columns': [f_item, f_qty, f_price, f_amount],
            'vat_rate': vat['name'], 'vat_amount': round(total_vat, 2)}

    if is_receipt:
        missing = [n for n, f in (('страна', f_country), ('ГТД', f_gtd), ('РНПТ', f_rnpt)) if not f]
        if missing:
            notes.append('Нет колонок в документе: ' + ', '.join(missing))
        if wh_key and 'Склад_Key' not in fields:
            notes.append('В документе нет реквизита «Склад» — товар не привязан к складу')

    f_vat_in_sum = pick(VAT_IN_SUM_FIELDS, fields)
    if f_vat_in_sum:
        doc[f_vat_in_sum] = True
        used['vat_in_sum_field'] = f_vat_in_sum
    elif percent:
        used['vat_in_sum_warning'] = (
            'В документе нет признака «НДС в сумме» — 1С может посчитать налог сверху. '
            'Доступные реквизиты: ' + ', '.join(fields[:40])
        )

    in_number = str(payload.get('incoming_number') or '').strip()
    if in_number:
        target = next((f for f in INCOMING_NUMBER_FIELDS if f in fields), None)
        if target:
            doc[target] = in_number
            used['number_field'] = target

    in_date = payload.get('incoming_date')
    if in_date:
        target = next((f for f in INCOMING_DATE_FIELDS if f in fields), None)
        if target:
            doc[target] = in_date
            used['date_field'] = target

    if notes:
        used['notes'] = notes

    if in_number and 'number_field' not in used:
        doc['Комментарий'] = f'Документ поставщика № {in_number}'
        used['fallback'] = 'Номер поставщика записан в комментарий: подходящего реквизита в документе нет'

    if payload.get('comment') and 'Комментарий' not in doc:
        doc['Комментарий'] = payload['comment']

    r = call_odata(cfg, f'{entity}?$format=json', method='POST', payload=doc)
    if not r['ok']:
        return {'ok': False, 'error': r['error'],
                'sent_head': {k: v for k, v in doc.items() if k != table},
                'sent_line': goods[0] if goods else None}
    d = r['data']
    written = d.get(table)
    written_count = len(written) if isinstance(written, list) else None

    if written_count == 0:
        return {
            'ok': False,
            'error': f'Документ создался, но строки не записались: 1С приняла таблицу «{table}», '
                     f'однако вернула её пустой. Проверьте имена колонок: {", ".join(cols[:30]) or "неизвестны"}',
            'key': d.get('Ref_Key'),
            'number': d.get('Number'),
            'sent_line': goods[0],
        }

    sent_amount = doc['СуммаДокумента']
    got_amount = d.get('СуммаДокумента')
    if got_amount is not None and abs(float(got_amount) - sent_amount) > 1:
        used['amount_warning'] = (
            f'Сумма в 1С ({got_amount}) отличается от отправленной ({sent_amount})'
        )

    return {
        'ok': True,
        'entity': entity,
        'key': d.get('Ref_Key'),
        'number': d.get('Number'),
        'date': d.get('Date'),
        'lines': written_count if written_count is not None else len(goods),
        'amount': sent_amount,
        'used': used,
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

    if action == 'doc_fields':
        return resp(200, {'schema': doc_schema(
            cfg, params.get('entity') or 'Document_СчетНаОплатуПоставщика'
        )})

    if action == 'match_products':
        return resp(200, {'result': match_products(cfg, body.get('rows') or [])})

    if action == 'create_goods_receipt':
        return resp(200, {'configured': True, 'result': create_supplier_invoice(
            cfg, body, entity='Document_ПоступлениеТоваровУслуг'
        )})

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