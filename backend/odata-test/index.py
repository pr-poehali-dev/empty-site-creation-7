"""Тесты обмена с 1С через OData: связь, поиск номенклатуры, создание и удаление пробных документов"""
import json
import os
import base64
import re
import time
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
    """Ищет товары по артикулу. Страница передаёт строки порциями."""
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
RNPT_FIELD_NAMES = ['НомерРНПТ_Key', 'РНПТ_Key', 'РегистрационныйНомерПартииТовара_Key',
                    'НомерРНПТ', 'РНПТ', 'РегистрационныйНомерПартииТовара']

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
    uniq = {(n or '').strip().upper() for n in names if (n or '').strip()}
    cache = {}
    if not uniq:
        return cache
    skip = 0
    while skip < 5000:
        r = call_odata(
            cfg,
            'Catalog_СтраныМира?$format=json&$select=Ref_Key,Description'
            f'&$top=1000&$skip={skip}'
        )
        if not r['ok']:
            break
        items = r['data'].get('value', []) or []
        for item in items:
            key = str(item.get('Description') or '').strip().upper()
            if key and key in uniq and key not in cache:
                cache[key] = item.get('Ref_Key')
        if len(items) < 1000:
            break
        skip += 1000
    return cache


GTD_NUMBER_FIELDS = ['РегистрационныйНомер', 'Номер', 'НомерГТД']
GTD_FLAG_TD = 'ЭтоНомерТД'
GTD_FLAG_RNPT = 'ЭтоРНПТ'


def gtd_kind(number):
    """Различает номер декларации и РНПТ по числу частей: три — ГТД, четыре — РНПТ."""
    parts = [p for p in str(number or '').strip().split('/') if p != '']
    if len(parts) == 3:
        return 'td'
    if len(parts) == 4:
        return 'rnpt'
    return None


def entity_fields_from_metadata(cfg, entity_type):
    """Берёт список реквизитов из описания структуры базы. Работает и на пустом справочнике."""
    r = call_odata(cfg, f'$metadata', raw=True)
    if not r['ok']:
        return []
    xml = r.get('text') or ''
    marker = f'EntityType Name="{entity_type}"'
    start = xml.find(marker)
    if start == -1:
        return []
    end = xml.find('</EntityType>', start)
    block = xml[start:end if end != -1 else len(xml)]
    return re.findall(r'<Property Name="([^"]+)"', block)


def gtd_schema(cfg):
    """Узнаёт, в каком реквизите справочника «Номера ГТД» лежит сам номер."""
    fields = []
    source = 'data'
    r = call_odata(cfg, 'Catalog_НомераГТД?$top=1&$format=json')
    if r['ok']:
        rows = r['data'].get('value') or []
        if rows:
            fields = list(rows[0].keys())

    if not fields:
        source = 'metadata'
        fields = entity_fields_from_metadata(cfg, 'Catalog_НомераГТД')

    number_field = pick(GTD_NUMBER_FIELDS, fields)
    if not number_field and fields:
        number_field = next(
            (f for f in fields if 'Номер' in f or f == 'Code' or f == 'Description'),
            None,
        )
    return {'fields': fields, 'number_field': number_field, 'source': source}


def gtd_payload(number, number_field, fields=None):
    body = {}
    if number_field:
        body[number_field] = number
    kind = gtd_kind(number)
    available = fields or []
    if kind == 'td' and (not available or GTD_FLAG_TD in available):
        body[GTD_FLAG_TD] = True
    elif kind == 'rnpt' and (not available or GTD_FLAG_RNPT in available):
        body[GTD_FLAG_RNPT] = True
    return body


def gtd_payload_full(number, number_field, fields):
    """Полный набор реквизитов: номер, код, признаки папки/удаления и вид номера."""
    body = {}
    if number_field:
        body[number_field] = number
    if 'Code' in fields:
        body['Code'] = number
    if 'IsFolder' in fields:
        body['IsFolder'] = False
    if 'DeletionMark' in fields:
        body['DeletionMark'] = False
    kind = gtd_kind(number)
    if kind == 'td' and GTD_FLAG_TD in fields:
        body[GTD_FLAG_TD] = True
    elif kind == 'rnpt' and GTD_FLAG_RNPT in fields:
        body[GTD_FLAG_RNPT] = True
    return body


def try_create_one_gtd(cfg, numbers):
    """Пробует создать ОДНУ запись номера ГТД с полным набором реквизитов."""
    sch = gtd_schema(cfg)
    f_number = sch['number_field']
    fields = sch['fields']

    candidates = [str(n or '').strip() for n in numbers]
    candidates = [n for n in candidates if n and gtd_kind(n) is not None]
    if not candidates:
        return {'ok': False, 'error': 'Не передан ни один подходящий номер',
                'fields': fields}

    existing = prefetch_gtd(cfg, candidates, f_number)
    number = next((n for n in candidates if not existing.get(n)), None)
    if not number:
        return {'ok': True, 'skipped': True,
                'error': 'Все переданные номера уже есть в справочнике',
                'fields': fields}

    payload = gtd_payload_full(number, f_number, fields)
    c = call_odata(cfg, 'Catalog_НомераГТД?$format=json', method='POST',
                   payload=payload)
    result = {
        'ok': c['ok'],
        'number': number,
        'number_field': f_number,
        'sent': payload,
        'fields': fields,
    }
    if c['ok']:
        data = c.get('data') or {}
        result['ref_key'] = data.get('Ref_Key')
        result['code'] = data.get('Code')
    else:
        result['error'] = c['error']
    return result


def repair_gtd(cfg, budget=18.0):
    """Ищет записи с пустым номером и помечает их на удаление. Ничего не создаёт."""
    started = time.time()
    sch = gtd_schema(cfg)
    f_number = sch['number_field']
    if not f_number:
        return {'ok': False, 'error': 'Не найден реквизит номера',
                'fields': sch['fields']}

    r = call_odata(
        cfg,
        f"Catalog_НомераГТД?$format=json&$top=200"
        f"&$select=Ref_Key,{f_number}&$filter={f_number} eq ''"
    )
    if not r['ok']:
        return {'ok': False, 'error': r['error'], 'number_field': f_number}

    rows = r['data'].get('value') or []
    marked = 0
    errors = []
    for item in rows:
        if time.time() - started > budget:
            break
        key = item.get('Ref_Key')
        if not key:
            continue
        u = call_odata(cfg, f"Catalog_НомераГТД(guid'{key}')?$format=json",
                       method='PATCH', payload={'DeletionMark': True})
        if u['ok']:
            marked += 1
        else:
            errors.append(u['error'])
            break

    return {
        'ok': True,
        'number_field': f_number,
        'found': len(rows),
        'fixed': 0,
        'marked': marked,
        'more': len(rows) >= 200,
        'errors': errors,
    }


def prefetch_gtd(cfg, numbers, number_field=None, errors=None, stats=None):
    """Читает номера ГТД пачками. Ищет и по реквизиту номера, и по коду."""
    uniq = sorted({(n or '').strip() for n in numbers if (n or '').strip()})
    cache = {}
    if not uniq:
        return cache
    wanted = set(uniq)
    f_num = 'РегистрационныйНомер'
    sel = f'Ref_Key,{f_num}'
    skip = 0
    scanned = 0
    pages = []
    stop = ''
    while skip < 60000:
        t0 = time.time()
        r = call_odata(
            cfg, f"Catalog_НомераГТД?$format=json&$select={sel}&$top=1000&$skip={skip}"
        )
        took = round(time.time() - t0, 2)
        if not r['ok']:
            pages.append({'skip': skip, 'got': 0, 'sec': took,
                          'hits': 0, 'error': str(r['error'])[:200]})
            stop = 'отказ 1С'
            if errors is not None and len(errors) < 3:
                errors.append(f'Реквизит {f_num} не читается: ' + str(r['error']))
            break
        items = r['data'].get('value', []) or []
        scanned += len(items)
        hits = 0
        for item in items:
            key = str(item.get(f_num) or '').strip()
            if key and key in wanted and key not in cache:
                cache[key] = item.get('Ref_Key')
                hits += 1
        pages.append({'skip': skip, 'got': len(items), 'sec': took,
                      'hits': hits, 'total_hits': len(cache)})
        print(f'[GTD] skip={skip} got={len(items)} sec={took} '
              f'hits={hits} total={len(cache)}')
        if len(items) < 1000:
            stop = 'страница короче 1000 — конец справочника'
            break
        skip += 1000
    else:
        stop = 'достигнут предел 60000'
    if stats is not None:
        stats['scanned'] = scanned
        stats['pages'] = pages
        stats['stop'] = stop
        stats['field'] = f_num
    return cache


def check_gtd(cfg, numbers):
    """Проверяет, какие номера ГТД уже есть в справочнике. Страница шлёт порциями."""
    uniq = sorted({str(n or '').strip() for n in numbers if str(n or '').strip()})
    read_errors = []
    stats = {}
    cache = prefetch_gtd(cfg, uniq, errors=read_errors, stats=stats)
    missing = [n for n in uniq if not cache.get(n) and gtd_kind(n) is not None]
    unknown = [n for n in uniq if gtd_kind(n) is None]
    return {
        'ok': not read_errors,
        'checked': len(uniq),
        'existing': len([n for n in uniq if cache.get(n)]),
        'missing': missing,
        'unknown': unknown,
        'read_errors': read_errors,
        'scanned': stats.get('scanned', 0),
        'pages': stats.get('pages', []),
        'stop': stats.get('stop', ''),
        'field': stats.get('field', ''),
        'error': ('Часть справочника не прочиталась: ' + read_errors[0])
                 if read_errors else None,
    }


def gtd_debug(cfg, numbers):
    """Диагностика поиска: размер справочника, образцы записей, точечные запросы."""
    out = {}
    f_num = 'РегистрационныйНомер'
    out['field'] = f_num

    c = call_odata(cfg, 'Catalog_НомераГТД/$count')
    out['count'] = c.get('text') if c['ok'] else f"ошибка: {c.get('error')}"
    if c['ok'] and not c.get('text'):
        out['count'] = json.dumps(c.get('data'))[:100]

    s = call_odata(cfg, 'Catalog_НомераГТД?$format=json&$top=3')
    out['samples'] = s['data'].get('value', []) if s['ok'] else str(s.get('error'))

    probes = []
    for n in [str(x or '').strip() for x in (numbers or [])][:3]:
        if not n:
            continue
        q = call_odata(
            cfg,
            f"Catalog_НомераГТД?$format=json&$filter={f_num} eq '{n}'&$top=5",
        )
        probes.append({
            'number': n,
            'found': len(q['data'].get('value', [])) if q['ok'] else None,
            'rows': q['data'].get('value', [])[:2] if q['ok'] else None,
            'error': None if q['ok'] else str(q.get('error'))[:200],
        })
    out['probes'] = probes

    chk = check_gtd(cfg, numbers or [])
    out['pages'] = chk.get('pages', [])
    out['scanned'] = chk.get('scanned', 0)
    out['stop'] = chk.get('stop', '')
    out['existing'] = chk.get('existing', 0)
    out['checked'] = chk.get('checked', 0)
    return out


def create_gtd_batch(cfg, numbers, budget=18.0):
    """Создаёт недостающие номера ГТД, сколько успеет за отведённое время."""
    started = time.time()
    uniq = []
    seen = set()
    for n in numbers:
        key = str(n or '').strip()
        if key and key not in seen:
            seen.add(key)
            uniq.append(key)

    if not uniq:
        return {'ok': True, 'created': 0, 'remaining': [], 'errors': []}

    sch = gtd_schema(cfg)
    f_number = sch['number_field']
    if not f_number:
        return {
            'ok': False,
            'error': 'Не удалось понять, в какой реквизит писать номер ГТД. '
                     'Реквизиты справочника: ' + (', '.join(sch['fields'][:40]) or 'не прочитаны'),
        }
    existing = prefetch_gtd(cfg, uniq, f_number)
    created = 0
    skipped = 0
    errors = []
    remaining = []
    unknown = [n for n in uniq if gtd_kind(n) is None]
    uniq = [n for n in uniq if gtd_kind(n) is not None]

    for idx, key in enumerate(uniq):
        if existing.get(key):
            skipped += 1
            continue
        if time.time() - started > budget:
            remaining = [k for k in uniq[idx:] if not existing.get(k)]
            break
        c = call_odata(cfg, 'Catalog_НомераГТД?$format=json', method='POST',
                       payload=gtd_payload_full(key, f_number, sch['fields']))
        if c['ok']:
            created += 1
        else:
            errors.append(f'{key}: {c["error"]}')
            remaining = [k for k in uniq[idx + 1:] if not existing.get(k)]
            return {
                'ok': False,
                'error': 'Создание остановлено на первой ошибке, чтобы не плодить записи: '
                         + c['error'],
                'created': created,
                'already': skipped,
                'remaining': remaining,
                'done': False,
                'errors': errors,
            }

    return {
        'ok': True,
        'created': created,
        'already': skipped,
        'remaining': remaining,
        'done': not remaining,
        'unknown': unknown,
        'errors': errors,
    }


def find_country(cfg, name, cache):
    """Ищет страну в справочнике «Страны мира» по названию."""
    key = (name or '').strip().upper()
    if not key:
        return None
    return cache.get(key)


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
    ref_numbers = []
    if f_gtd:
        ref_numbers += [r.get('gtd') for r in rows]
    if f_rnpt and f_rnpt.endswith('_Key'):
        ref_numbers += [r.get('rnpt') for r in rows]
    gtd_cache = prefetch_gtd(cfg, ref_numbers) if ref_numbers else {}
    notes = []
    missing_gtd = set()
    missing_country = set()
    missing_rnpt = set()

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
                    missing_country.add(str(r['country']).strip())
            if f_gtd and r.get('gtd'):
                gk = gtd_cache.get(str(r['gtd']).strip())
                if gk:
                    row[f_gtd] = gk
                else:
                    missing_gtd.add(str(r['gtd']).strip())
            if f_rnpt and r.get('rnpt'):
                rn = str(r['rnpt']).strip()
                if f_rnpt.endswith('_Key'):
                    rk = gtd_cache.get(rn)
                    if rk:
                        row[f_rnpt] = rk
                    else:
                        missing_rnpt.add(rn)
                else:
                    row[f_rnpt] = rn

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
        if missing_gtd:
            sample = ', '.join(sorted(missing_gtd)[:5])
            notes.append(
                f'Нет в справочнике номеров ГТД: {len(missing_gtd)} шт ({sample}...). '
                'Строки записаны без них'
            )
        if missing_rnpt:
            sample = ', '.join(sorted(missing_rnpt)[:5])
            notes.append(
                f'Нет в справочнике номеров РНПТ: {len(missing_rnpt)} шт ({sample}...). '
                'Строки записаны без них'
            )
        if missing_country:
            notes.append('Не найдены страны: ' + ', '.join(sorted(missing_country)[:10]))
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

    if action == 'gtd_schema':
        return resp(200, {'result': gtd_schema(cfg)})

    if action == 'repair_gtd':
        return resp(200, {'result': repair_gtd(cfg)})

    if action == 'check_gtd':
        return resp(200, {'result': check_gtd(cfg, body.get('numbers') or [])})

    if action == 'gtd_debug':
        return resp(200, {'result': gtd_debug(cfg, body.get('numbers') or [])})

    if action == 'try_create_one_gtd':
        return resp(200, {'result': try_create_one_gtd(cfg, body.get('numbers') or [])})

    if action == 'create_gtd':
        return resp(200, {'result': create_gtd_batch(cfg, body.get('numbers') or [])})

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