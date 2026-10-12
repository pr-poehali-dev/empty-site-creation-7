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
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg2
from sites import site_lookup

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


NOMEN_SELECT = 'Ref_Key,Code,Description,Артикул,DeletionMark,Parent_Key'


def _card(i):
    return {
        'key': i.get('Ref_Key'),
        'code': (i.get('Code') or '').strip(),
        'name': i.get('Description'),
        'article': (i.get('Артикул') or '').strip(),
        'deleted': bool(i.get('DeletionMark')),
    }


def _q(v):
    return str(v).replace("'", "''")


def nomen_find_one(cfg, by, value):
    """Ищет карточки номенклатуры по одному значению. Возвращает (список карточек, ошибка)."""
    value = str(value or '').strip()
    if not value:
        return [], None
    if by == 'barcode':
        sel = ','.join('Номенклатура/' + f for f in NOMEN_SELECT.split(','))
        r = call_odata(cfg, "InformationRegister_ШтрихкодыНоменклатуры?$format=json"
                            f"&$filter=Штрихкод eq '{_q(value)}'&$expand=Номенклатура&$select=Штрихкод,{sel}")
        if not r['ok']:
            return [], r['error']
        return [_card(x['Номенклатура']) for x in r['data'].get('value', [])
                if isinstance(x.get('Номенклатура'), dict)], None
    if by == 'name':
        return find_by_name(cfg, value)
    r = call_odata(cfg, f"Catalog_Номенклатура?$format=json&$top=20&$select={NOMEN_SELECT}"
                        f"&$filter=Артикул eq '{_q(value)}' and IsFolder eq false")
    if not r['ok']:
        return [], r['error']
    return [_card(i) for i in r['data'].get('value', [])], None


def norm_name(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()


def find_by_name(cfg, value):
    """Наименование совпадает, если отличается только лишними пробелами."""
    target = norm_name(value)
    words = sorted(set(target.split(' ')), key=len, reverse=True)[:6]
    cond = ' and '.join(f"substringof('{_q(w)}',Description) eq true" for w in words)
    r = call_odata(cfg, f"Catalog_Номенклатура?$format=json&$top=200&$select={NOMEN_SELECT}"
                        f"&$filter={cond} and IsFolder eq false")
    if not r['ok']:
        return [], r['error']
    return [_card(i) for i in r['data'].get('value', []) if norm_name(i.get('Description')) == target], None


NOMEN_FIELDS = ('article', 'name')


def card_barcodes(cfg, key):
    r = call_odata(cfg, "InformationRegister_ШтрихкодыНоменклатуры?$format=json&$select=Штрихкод"
                        f"&$filter=Номенклатура_Key eq guid'{key}'")
    if not r['ok']:
        return None, r['error']
    return [str(x.get('Штрихкод') or '').strip() for x in r['data'].get('value', [])], None


def _run_parallel(fn, tasks, workers=8):
    out, errors = {}, {}
    if not tasks:
        return out, errors
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fn, *t): t for t in tasks}
        for fut in as_completed(futures):
            t = futures[fut]
            try:
                res, err = fut.result()
            except Exception as e:
                res, err = None, str(e)[:200]
            out[t] = res
            if err:
                errors[t] = err
    return out, errors


def _row_status(active_count):
    if active_count == 1:
        return 'found'
    if active_count > 1:
        return 'multiple'
    return 'missing'


def nomen_match(cfg, rows, mode='single', by='article', exact=True, check_barcodes=False):
    """Проверяет порцию строк счёта в 1С.
    mode=single — по одному реквизиту by (артикул или наименование); mode=all — по артикулу и наименованию:
    exact — у одной карточки должны совпасть все заполненные в счёте реквизиты, иначе хватит одного.
    check_barcodes — у найденной карточки сверить штрихкоды с штрихкодом из счёта."""
    if mode not in ('single', 'all'):
        return {'ok': False, 'error': 'Неизвестный режим поиска'}
    if mode == 'single' and by not in NOMEN_FIELDS:
        return {'ok': False, 'error': 'Неизвестный реквизит поиска'}
    fields = NOMEN_FIELDS if mode == 'all' else (by,)
    norm_rows = [{'article': str(r.get('article') or '').strip(), 'name': norm_name(r.get('name')),
                  'barcode': str(r.get('barcode') or '').strip()} for r in rows]

    look = set()
    for r in norm_rows:
        for f in fields:
            if r[f]:
                look.add((f, r[f]))
        if check_barcodes and r['barcode']:
            look.add(('barcode', r['barcode']))
    found, errors = _run_parallel(lambda f, v: nomen_find_one(cfg, f, v), sorted(look))

    items = []
    for r in norm_rows:
        filled = [f for f in fields if r[f]]
        err = next((errors[(f, r[f])] for f in filled if (f, r[f]) in errors), None)
        by_key, hits = {}, {}
        for f in fields:
            if not r[f]:
                hits[f] = None
                continue
            cards = found.get((f, r[f])) or []
            hits[f] = any(not c['deleted'] for c in cards)
            for c in cards:
                entry = by_key.setdefault(c['key'], dict(c, matched=[]))
                entry['matched'].append(f)
        cards = list(by_key.values())
        active = [c for c in cards if not c['deleted']]
        if not filled:
            status = 'empty'
        elif err:
            status = 'error'
        elif mode == 'single' or not exact:
            status = _row_status(len(active))
        else:
            full = [c for c in active if all(f in c['matched'] for f in filled)]
            status = _row_status(len(full))
            if status == 'missing' and active:
                status = 'partial'
            if full:
                for c in active:
                    c['full'] = c in full
        items.append({
            'value': r[by] if mode == 'single' else '',
            'status': status, 'cards': cards, 'hits': hits, 'error': err,
        })

    if check_barcodes:
        targets = {}
        for r, it in zip(norm_rows, items):
            if it['status'] != 'found':
                continue
            card = next((c for c in it['cards'] if not c['deleted'] and c.get('full', True)), None)
            if card and r['barcode']:
                it['card_key'] = card['key']
                targets[(card['key'],)] = True
        codes, code_err = _run_parallel(lambda k: card_barcodes(cfg, k), list(targets))
        for r, it in zip(norm_rows, items):
            if it['status'] != 'found':
                continue
            if not r['barcode']:
                it['bc'] = {'state': 'no_invoice'}
                continue
            key = it.get('card_key')
            if (key,) in code_err:
                it['bc'] = {'state': 'error', 'error': code_err[(key,)]}
                continue
            have = codes.get((key,)) or []
            owners = [c for c in (found.get(('barcode', r['barcode'])) or [])]
            other = next((c for c in owners if c['key'] != key), None)
            if r['barcode'] in have:
                state = 'ok'
            elif other:
                state = 'taken'
            elif not have:
                state = 'none'
            else:
                state = 'other'
            it['bc'] = {'state': state, 'have': have,
                        'owner': {'code': other['code'], 'name': other['name'], 'article': other.get('article', '')} if other else None}
    return {'ok': True, 'items': items}


def add_one_barcode(cfg, key, barcode):
    cards, err = nomen_find_one(cfg, 'barcode', barcode)
    if err:
        return {'state': 'error', 'error': err}, None
    owner = next((c for c in cards if c['key'] != key), None)
    if owner:
        return {'state': 'taken', 'owner': {'code': owner['code'], 'name': owner['name']}}, None
    if cards:
        return {'state': 'exists'}, None
    r = call_odata(cfg, 'InformationRegister_ШтрихкодыНоменклатуры?$format=json', method='POST',
                   payload={'Штрихкод': barcode, 'Номенклатура_Key': key})
    if not r['ok']:
        return {'state': 'error', 'error': r['error']}, None
    return {'state': 'added'}, None


def nomen_add_barcodes(cfg, rows):
    """Дописывает штрихкоды карточкам: перед записью проверяет, что штрихкод никому не принадлежит."""
    tasks = []
    for r in rows:
        key = str(r.get('key') or '').strip()
        bc = str(r.get('barcode') or '').strip()
        if re.fullmatch(r'[0-9a-f-]{36}', key) and bc:
            tasks.append((key, bc))
    out, _ = _run_parallel(lambda k, b: add_one_barcode(cfg, k, b), tasks, workers=4)
    return {'ok': True, 'items': [{'key': k, 'barcode': b, **(out.get((k, b)) or {'state': 'error'})}
                                  for k, b in tasks]}


def nomen_groups(cfg):
    """Папки номенклатуры (группы) с полным путём."""
    r = call_odata(cfg, "Catalog_Номенклатура?$format=json&$select=Ref_Key,Description,Parent_Key"
                        "&$filter=IsFolder eq true and DeletionMark eq false")
    if not r['ok']:
        return {'ok': False, 'error': r['error']}
    rows = r['data'].get('value', [])
    by_key = {x['Ref_Key']: x for x in rows}

    def path(x, depth=0):
        p = by_key.get(x.get('Parent_Key'))
        return (path(p, depth + 1) + ' / ' if p and depth < 10 else '') + (x.get('Description') or '')

    groups = sorted(({'key': x['Ref_Key'], 'name': x.get('Description') or '', 'path': path(x)} for x in rows),
                    key=lambda g: g['path'].lower())
    return {'ok': True, 'groups': groups}


def tnved_code(cfg, key):
    r = call_odata(cfg, f"Catalog_КлассификаторТНВЭД(guid'{key}')?$format=json&$select=Code,Description")
    if not r['ok']:
        return None, r['error']
    return (r['data'].get('Code') or r['data'].get('Description') or '').strip(), None


COUNTRY_FAMILIES = [('холодильн', 'олодильн', 'Холодильники'),
                    ('морозильн', 'орозильн', 'Морозильники'),
                    ('стиральн', 'тиральн', 'Стиральные машины')]
COUNTRY_MIN_SIMILAR = 10
NOT_TRACEABLE_COUNTRIES = ('643', '112')


def country_family(kind):
    low = str(kind or '').lower()
    return next((f for f in COUNTRY_FAMILIES if f[0] in low), None)


def countries_by_family(cfg, stem):
    r = call_odata(cfg, "Catalog_Номенклатура?$format=json&$top=2000&$select=СтранаПроисхождения_Key"
                        f"&$filter=IsFolder eq false and DeletionMark eq false"
                        f" and substringof('{_q(stem)}',Description) eq true")
    if not r['ok']:
        return None, r['error']
    counts = {}
    total = 0
    for x in r['data'].get('value', []):
        total += 1
        c = x.get('СтранаПроисхождения_Key') or EMPTY_GUID
        c = '' if c == EMPTY_GUID else c
        counts[c] = counts.get(c, 0) + 1
    return {'total': total, 'counts': counts}, None


def load_countries(cfg):
    r = call_odata(cfg, "Catalog_СтраныМира?$format=json&$select=Ref_Key,Code,Description,DeletionMark")
    if not r['ok']:
        return [], r['error']
    out = [{'key': x['Ref_Key'], 'code': (x.get('Code') or '').strip(), 'name': (x.get('Description') or '').strip()}
           for x in r['data'].get('value', []) if not x.get('DeletionMark')]
    out.sort(key=lambda c: c['name'])
    return out, None


def country_options(counts):
    opts = [{'key': k, 'count': n} for k, n in counts.items()]
    opts.sort(key=lambda o: -o['count'])
    return opts


def tnved_by_type(cfg, kind):
    r = call_odata(cfg, "Catalog_Номенклатура?$format=json&$top=1000"
                        "&$select=КодТНВЭД_Key,Description,Code,ВесПоСертификатуТовара,СтранаПроисхождения_Key"
                        f"&$filter=IsFolder eq false and DeletionMark eq false"
                        f" and startswith(Description,'{_q(kind)} ') eq true")
    if not r['ok']:
        return None, r['error']
    counts = {}
    countries = {}
    total = 0
    weights = []
    for x in r['data'].get('value', []):
        total += 1
        k = x.get('КодТНВЭД_Key')
        if k and k != EMPTY_GUID:
            counts[k] = counts.get(k, 0) + 1
        c = x.get('СтранаПроисхождения_Key') or EMPTY_GUID
        c = '' if c == EMPTY_GUID else c
        countries[c] = countries.get(c, 0) + 1
        try:
            w = float(x.get('ВесПоСертификатуТовара') or 0)
        except (TypeError, ValueError):
            w = 0
        if w > 0:
            weights.append({'name': (x.get('Description') or '').strip(), 'code': (x.get('Code') or '').strip(), 'w': w})
    return {'total': total, 'counts': counts, 'weights': weights, 'countries': countries}, None


def nomen_tnved(cfg, kinds):
    """Подбор по похожим товарам: ТНВЭД, вес, а для холодильников/морозильников/стиральных — страна происхождения."""
    kinds = sorted({str(k or '').strip() for k in kinds if str(k or '').strip()})[:40]
    stats, errors = _run_parallel(lambda k: tnved_by_type(cfg, k), [(k,) for k in kinds])
    keys = sorted({g for s in stats.values() if s for g in s['counts']})
    codes, _ = _run_parallel(lambda k: tnved_code(cfg, k), [(k,) for k in keys])
    need_wide = sorted({country_family(k)[1] for k in kinds if country_family(k)
                        and (stats.get((k,)) or {}).get('total', 0) < COUNTRY_MIN_SIMILAR})
    wide, _ = _run_parallel(lambda s: countries_by_family(cfg, s), [(s,) for s in need_wide])
    countries, cerr = load_countries(cfg) if any(country_family(k) for k in kinds) else ([], None)
    out = {}
    for (k,) in [(k,) for k in kinds]:
        s = stats.get((k,))
        if not s:
            out[k] = {'similar': 0, 'options': [], 'weights': [], 'error': errors.get((k,))}
            continue
        opts = [{'key': g, 'code': codes.get((g,)) or '', 'count': n} for g, n in s['counts'].items()]
        opts.sort(key=lambda o: -o['count'])
        out[k] = {'similar': s['total'], 'options': opts, 'weights': s['weights']}
        fam = country_family(k)
        if fam:
            w = wide.get((fam[1],)) if s['total'] < COUNTRY_MIN_SIMILAR else None
            src = w or {'total': s['total'], 'counts': s['countries']}
            out[k]['country'] = {'basis': fam[2] if w else k, 'similar': src['total'],
                                 'options': country_options(src['counts'])}
    return {'ok': True, 'kinds': out, 'countries': countries, 'countries_error': cerr}


def country_code(cfg, key):
    r = call_odata(cfg, f"Catalog_СтраныМира(guid'{key}')?$format=json&$select=Code,Description")
    if not r['ok']:
        return None, r['error']
    return (r['data'].get('Code') or '').strip(), None


def _first_key(cfg, entity, desc):
    r = call_odata(cfg, f"{entity}?$format=json&$top=1&$select=Ref_Key"
                        f"&$filter=Description eq '{_q(desc)}' and DeletionMark eq false")
    if not r['ok']:
        return None, r['error']
    v = r['data'].get('value', [])
    return (v[0]['Ref_Key'] if v else None), None


def nomen_refs(cfg):
    """Ссылки на справочники, общие для всех новых карточек."""
    want = {
        'kind': ('Catalog_ВидыНоменклатуры', 'Товары'),
        'unit': ('Catalog_КлассификаторЕдиницИзмерения', 'шт'),
        'group1c': ('Catalog_НоменклатурныеГруппы', 'Основная номенклатурная группа'),
        'price_type': ('Catalog_ТипыЦенНоменклатуры', 'Базовая'),
    }
    out, _ = _run_parallel(lambda k: _first_key(cfg, *want[k]), [(k,) for k in want], workers=4)
    refs = {k: out.get((k,)) for k in want}
    missing = [want[k][1] for k, v in refs.items() if not v]
    if missing:
        return None, 'В 1С не нашёл: ' + ', '.join(missing)
    r = call_odata(cfg, f"Catalog_ТипыЦенНоменклатуры(guid'{refs['price_type']}')?$format=json&$select=ВалютаЦены_Key")
    refs['currency'] = (r.get('data') or {}).get('ВалютаЦены_Key') if r['ok'] else None
    return refs, None


def tnved_key_by_code(cfg, code):
    r = call_odata(cfg, "Catalog_КлассификаторТНВЭД?$format=json&$top=1&$select=Ref_Key"
                        f"&$filter=Code eq '{_q(code)}' and DeletionMark eq false")
    if not r['ok']:
        return None, r['error']
    v = r['data'].get('value', [])
    return (v[0]['Ref_Key'] if v else None), None


def _num(v):
    try:
        return float(str(v).replace(',', '.').replace(' ', ''))
    except (TypeError, ValueError):
        return 0.0


def write_barcode(cfg, key, barcode):
    """Пишет штрихкод карточке, если он свободен. Возвращает словарь с итогом."""
    if not barcode:
        return {'barcode': 'none'}
    owners, err = nomen_find_one(cfg, 'barcode', barcode)
    if err:
        return {'barcode': 'error', 'barcode_error': err}
    other = next((c for c in owners if c['key'] != key), None)
    if other:
        return {'barcode': 'taken', 'barcode_owner': {'code': other['code'], 'name': other['name']}}
    if owners:
        return {'barcode': 'added'}
    b = call_odata(cfg, 'InformationRegister_ШтрихкодыНоменклатуры?$format=json', method='POST',
                   payload={'Штрихкод': barcode, 'Номенклатура_Key': key})
    if not b['ok']:
        return {'barcode': 'error', 'barcode_error': b['error']}
    return {'barcode': 'added'}


def precheck_card(cfg, article, name):
    """Перед созданием: артикул + наименование. Возвращает (state, cards, error)."""
    tasks = [('name', name)] + ([('article', article)] if article else [])
    found, errors = _run_parallel(lambda f, v: nomen_find_one(cfg, f, v), tasks, workers=2)
    if errors:
        return 'error', [], next(iter(errors.values()))
    by_key = {}
    for f, v in tasks:
        for c in found.get((f, v)) or []:
            if c['deleted']:
                continue
            by_key.setdefault(c['key'], dict(c, matched=[]))['matched'].append(f)
    cards = list(by_key.values())
    need = {'name', 'article'} if article else {'name'}
    if any(need <= set(c['matched']) for c in cards):
        return 'exists', [c for c in cards if need <= set(c['matched'])], None
    if cards:
        return 'conflict', cards, None
    return 'ok', [], None


def with_barcodes(cfg, cards):
    out, _ = _run_parallel(lambda k: card_barcodes(cfg, k), [(c['key'],) for c in cards], workers=4)
    return [dict(c, barcodes=out.get((c['key'],)) or []) for c in cards]


def create_one_card(cfg, refs, row, force=False):
    """Создаёт одну карточку и записывает её штрихкод (если он свободен)."""
    article = str(row.get('article') or '').strip()
    name = norm_name(row.get('name'))
    barcode = str(row.get('barcode') or '').strip()
    tnved = str(row.get('tnved') or '').strip()
    group = str(row.get('group_key') or '').strip()
    weight = _num(row.get('weight'))
    base = {'idx': row.get('idx'), 'article': article}
    if not name or not re.fullmatch(r'[0-9a-f-]{36}', group) or weight <= 0 \
            or not re.fullmatch(r'\d{10}', tnved):
        return dict(base, state='error', error='Не заполнены обязательные реквизиты')

    if not force:
        state, cards, err = precheck_card(cfg, article, name)
        if err:
            return dict(base, state='error', error=err)
        if state == 'exists':
            return dict(base, state='exists', card=cards[0])
        if state == 'conflict':
            return dict(base, state='conflict', cards=with_barcodes(cfg, cards[:10]))

    tkey = str(row.get('tnved_key') or '').strip()
    if not re.fullmatch(r'[0-9a-f-]{36}', tkey):
        tkey, err = tnved_key_by_code(cfg, tnved)
        if err:
            return dict(base, state='error', error=err)
        if not tkey:
            return dict(base, state='error', error=f'Кода ТНВЭД {tnved} нет в справочнике 1С')

    payload = {
        'Description': name[:100],
        'НаименованиеПолное': name,
        'Артикул': article,
        'IsFolder': False,
        'Parent_Key': group,
        'ВидНоменклатуры_Key': refs['kind'],
        'ЕдиницаИзмерения_Key': refs['unit'],
        'НоменклатурнаяГруппа_Key': refs['group1c'],
        'ВидСтавкиНДС': 'Общая',
        'ВесПоСертификатуТовара': weight,
        'КодТНВЭД_Key': tkey,
        'Услуга': False,
    }
    r = call_odata(cfg, 'Catalog_Номенклатура?$format=json', method='POST', payload=payload)
    if not r['ok']:
        return dict(base, state='error', error=r['error'])
    d = r['data']
    res = dict(base, state='created', key=d.get('Ref_Key'), code=(d.get('Code') or '').strip(),
               name=d.get('Description'))
    res.update(write_country(cfg, res['key'], str(row.get('country_key') or '').strip()))
    res.update(write_barcode(cfg, res['key'], barcode))
    return res


def write_country(cfg, key, ckey):
    """Страна происхождения + галочка «Прослеживаемый товар» (не Россия и не Беларусь)."""
    if not re.fullmatch(r'[0-9a-f-]{36}', ckey) or ckey == EMPTY_GUID:
        return {'country': 'none'}
    code, err = country_code(cfg, ckey)
    if err:
        return {'country': 'error', 'country_error': err}
    traceable = code not in NOT_TRACEABLE_COUNTRIES
    r = call_odata(cfg, f"Catalog_Номенклатура(guid'{key}')?$format=json", method='PATCH',
                   payload={'СтранаПроисхождения_Key': ckey, 'ПрослеживаемыйТовар': traceable})
    if not r['ok']:
        return {'country': 'error', 'country_error': r['error']}
    got = r.get('data') or {}
    if 'СтранаПроисхождения_Key' not in got:
        g = call_odata(cfg, f"Catalog_Номенклатура(guid'{key}')?$format=json"
                            "&$select=СтранаПроисхождения_Key,ПрослеживаемыйТовар")
        got = g.get('data') or {} if g['ok'] else {}
    if got.get('СтранаПроисхождения_Key') != ckey or bool(got.get('ПрослеживаемыйТовар')) != traceable:
        return {'country': 'error', 'country_error': '1С не сохранила страну или галочку'}
    return {'country': 'set', 'traceable': traceable}


def nomen_create(cfg, rows, force=False):
    """Создаёт порцию карточек номенклатуры (по одной, параллельно). force — без проверки на совпадения."""
    refs, err = nomen_refs(cfg)
    if err:
        return {'ok': False, 'error': err}
    rows = rows[:10]
    out, errors = _run_parallel(lambda i: (create_one_card(cfg, refs, rows[i], force), None),
                                [(i,) for i in range(len(rows))], workers=4)
    items = []
    for i, row in enumerate(rows):
        res = out.get((i,))
        if not res:
            res = {'idx': row.get('idx'), 'article': row.get('article'), 'state': 'error',
                   'error': errors.get((i,)) or 'Нет ответа'}
        items.append(res)
    return {'ok': True, 'items': items}


def nomen_set_prices(cfg, rows, comment=''):
    """Один документ «Установка цен номенклатуры» с типом «Базовая» на все позиции, затем проведение."""
    refs, err = nomen_refs(cfg)
    if err:
        return {'ok': False, 'error': err}
    goods = []
    for r in rows:
        key = str(r.get('key') or '').strip()
        price = round(_num(r.get('price')), 2)
        if re.fullmatch(r'[0-9a-f-]{36}', key) and price > 0:
            line = {'LineNumber': str(len(goods) + 1), 'Номенклатура_Key': key, 'Цена': price}
            if refs.get('currency'):
                line['Валюта_Key'] = refs['currency']
            goods.append(line)
    if not goods:
        return {'ok': False, 'error': 'Нет позиций с ценой'}
    doc = {
        'Date': datetime.now().strftime('%Y-%m-%dT00:00:00'),
        'ТипЦен_Key': refs['price_type'],
        'НеПроводитьНулевыеЗначения': True,
        'Комментарий': (comment or 'Создано сайтом: новая номенклатура')[:200],
        'Товары': goods,
    }
    r = call_odata(cfg, 'Document_УстановкаЦенНоменклатуры?$format=json', method='POST', payload=doc)
    if not r['ok']:
        return {'ok': False, 'error': r['error']}
    d = r['data']
    key = d.get('Ref_Key')
    p = call_odata(cfg, f"Document_УстановкаЦенНоменклатуры(guid'{key}')/Post?PostingModeOperational=false",
                   method='POST', raw=True)
    return {'ok': True, 'key': key, 'number': d.get('Number'), 'lines': len(goods),
            'posted': p['ok'], 'post_error': None if p['ok'] else p['error']}


NOMEN_SETS_HINTS = ('Номенклатур', 'Штрихкод', 'Цен', 'НДС', 'ЕдиницИзмерения', 'КлассификаторЕдиниц',
                    'ТНВЭД', 'ВЭД', 'Упаковк', 'Весов')


def _entity_props(xml, name):
    m = re.search(r'<EntityType Name="' + re.escape(name) + r'"[^>]*>(.*?)</EntityType>', xml, re.S)
    if not m:
        return []
    return [{'name': n, 'type': t} for n, t in re.findall(r'<Property Name="([^"]+)" Type="([^"]+)"', m.group(1))]


def _short(v):
    if isinstance(v, list):
        return [_short(x) for x in v[:2]]
    if isinstance(v, dict):
        return {k: _short(x) for k, x in v.items() if not k.endswith('@navigationLinkUrl')}
    return v


def nomen_schema(cfg):
    """Только чтение: структура карточки номенклатуры и связанных справочников/регистров."""
    r = call_odata(cfg, '$metadata', raw=True)
    if not r['ok']:
        return {'ok': False, 'error': r['error']}
    xml = r.get('text') or ''
    sets = sorted(set(re.findall(r'<EntitySet Name="([^"]+)"', xml)))
    related = [s for s in sets if any(h in s for h in NOMEN_SETS_HINTS)
               and not s.startswith(('ChartOf', 'Task_', 'BusinessProcess'))]
    out = {'ok': True, 'related_sets': related,
           'nomen_props': _entity_props(xml, 'Catalog_Номенклатура'), 'samples': {}}
    q = ("Catalog_Номенклатура?$format=json&$top=2&$filter=IsFolder eq false and DeletionMark eq false"
         " and substringof('Weissgauff', Description)")
    s = call_odata(cfg, q)
    out['samples']['Catalog_Номенклатура'] = _short((s.get('data') or {}).get('value')) if s['ok'] else s['error']
    g = call_odata(cfg, "Catalog_Номенклатура?$format=json&$top=300&$select=Ref_Key,Description,Parent_Key"
                        "&$filter=IsFolder eq true and DeletionMark eq false")
    out['groups'] = [x.get('Description') for x in (g.get('data') or {}).get('value', [])] if g['ok'] else g['error']
    for name in related:
        if name == 'Catalog_Номенклатура' or name.endswith('_RecordType') or '_' in name.split('_', 1)[1]:
            continue
        rr = call_odata(cfg, f'{name}?$format=json&$top=3')
        out['samples'][name] = _short((rr.get('data') or {}).get('value')) if rr['ok'] else rr['error']
    return out


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


GTD_NUM_FIELD = 'РегистрационныйНомер'


def find_one_gtd(cfg, number):
    """Ищет ОДИН номер ГТД. Возвращает (Ref_Key | None, текст ошибки | None)."""
    n = str(number or '').strip()
    if not n:
        return None, None
    r = call_odata(
        cfg,
        f"Catalog_НомераГТД?$format=json&$filter={GTD_NUM_FIELD} eq '{n}'&$top=1",
    )
    if not r['ok']:
        return None, str(r['error'])[:200]
    items = r['data'].get('value', []) or []
    if not items:
        return None, None
    return items[0].get('Ref_Key'), None


def lookup_gtd(cfg, numbers, errors=None, stats=None, budget=None, workers=8):
    """Ищет номера ГТД по одному, параллельно. Возвращает {номер: Ref_Key}."""
    uniq = sorted({str(n or '').strip() for n in numbers if str(n or '').strip()})
    cache = {}
    if not uniq:
        return cache
    started = time.time()
    found = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(find_one_gtd, cfg, n): n for n in uniq}
        for fut in as_completed(futures):
            n = futures[fut]
            try:
                ref, err = fut.result()
            except Exception as e:
                ref, err = None, str(e)[:200]
            if err and errors is not None and len(errors) < 3:
                errors.append(f'{n}: {err}')
            if ref:
                cache[n] = ref
                found += 1
    took = round(time.time() - started, 2)
    print(f'[GTD] one-by-one asked={len(uniq)} found={found} sec={took}')
    if stats is not None:
        stats['scanned'] = len(uniq)
        stats['sec'] = took
        stats['stop'] = 'проверены все номера'
        stats['field'] = GTD_NUM_FIELD
    return cache


def prefetch_gtd(cfg, numbers, number_field=None, errors=None, stats=None):
    """Совместимость: точечный поиск номеров ГТД."""
    return lookup_gtd(cfg, numbers, errors=errors, stats=stats)


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
        'refs': cache,
        'missing': missing,
        'unknown': unknown,
        'read_errors': read_errors,
        'scanned': stats.get('scanned', 0),
        'sec': stats.get('sec', 0),
        'stop': stats.get('stop', ''),
        'field': stats.get('field', ''),
        'error': ('1С отказала при поиске: ' + read_errors[0])
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


def gtd_fix_payload(number):
    """Реквизиты как в настоящей записи 1С."""
    kind = gtd_kind(number)
    return {
        'Code': number[:25],
        GTD_NUM_FIELD: number,
        'СтранаВвозаНеРФ': False,
        'ЭтоНомерТД': kind == 'td',
        'ЭтоРНПТ': kind == 'rnpt',
        'DeletionMark': False,
    }


def gtd_update_one(cfg, number, ref):
    """Перезаписывает реквизиты одной записи и перечитывает её."""
    before = call_odata(cfg, f"Catalog_НомераГТД(guid'{ref}')?$format=json")
    u = call_odata(cfg, f"Catalog_НомераГТД(guid'{ref}')?$format=json",
                   method='PATCH', payload=gtd_fix_payload(number))
    after = call_odata(cfg, f"Catalog_НомераГТД(guid'{ref}')?$format=json")
    got = str((after.get('data') or {}).get(GTD_NUM_FIELD) or '').strip() if after['ok'] else ''
    return {
        'number': number,
        'ref': ref,
        'before': before.get('data') if before['ok'] else str(before.get('error'))[:200],
        'after': after.get('data') if after['ok'] else str(after.get('error'))[:200],
        'ok': u['ok'] and got == number,
        'error': None if u['ok'] else str(u.get('error'))[:300],
    }


def gtd_probe(cfg, numbers):
    """Проба: обновляет реквизиты трёх номеров и показывает результат по каждому."""
    want = [str(n or '').strip() for n in (numbers or []) if str(n or '').strip()][:3]
    if not want:
        return {'error': 'Не передан ни один номер'}
    found = lookup_gtd(cfg, want)
    out = []
    for n in want:
        ref = found.get(n)
        if not ref:
            out.append({'number': n, 'ok': False, 'error': 'Запись в 1С не найдена'})
            continue
        out.append(gtd_update_one(cfg, n, ref))
    return {'results': out}


def gtd_fix_all(cfg, numbers, budget=18.0):
    """Обновляет реквизиты всех переданных номеров. Ненайденные создаёт заново."""
    started = time.time()
    uniq = []
    seen = set()
    for n in numbers or []:
        key = str(n or '').strip()
        if key and key not in seen and gtd_kind(key) is not None:
            seen.add(key)
            uniq.append(key)
    if not uniq:
        return {'ok': True, 'updated': 0, 'created': 0, 'remaining': [], 'errors': []}

    found = lookup_gtd(cfg, uniq, budget=budget / 2)
    updated = 0
    created = 0
    errors = []
    remaining = []
    for idx, n in enumerate(uniq):
        if time.time() - started > budget:
            remaining = uniq[idx:]
            break
        ref = found.get(n)
        if ref:
            r = call_odata(cfg, f"Catalog_НомераГТД(guid'{ref}')?$format=json",
                           method='PATCH', payload=gtd_fix_payload(n))
            if r['ok']:
                updated += 1
            elif len(errors) < 5:
                errors.append(f'{n}: {str(r["error"])[:200]}')
        else:
            r = call_odata(cfg, 'Catalog_НомераГТД?$format=json', method='POST',
                           payload=gtd_fix_payload(n))
            if r['ok']:
                created += 1
            elif len(errors) < 5:
                errors.append(f'{n}: {str(r["error"])[:200]}')
    return {
        'ok': True,
        'updated': updated,
        'created': created,
        'remaining': remaining,
        'done': not remaining,
        'errors': errors,
    }


def gtd_foreign(cfg, numbers):
    """Возвращает 3 записи справочника, не совпавшие с нашими номерами, целиком."""
    f_num = 'РегистрационныйНомер'
    ours = [str(n or '').strip() for n in (numbers or []) if str(n or '').strip()]
    wanted = set(ours)
    foreign = []
    scanned = 0
    skip = 0
    while skip < 60000 and len(foreign) < 3:
        r = call_odata(cfg, f"Catalog_НомераГТД?$format=json&$top=1000&$skip={skip}")
        if not r['ok']:
            return {'error': str(r['error'])[:300], 'scanned': scanned}
        items = r['data'].get('value', []) or []
        scanned += len(items)
        for item in items:
            val = str(item.get(f_num) or '').strip()
            if val and val not in wanted:
                foreign.append({
                    'value': val,
                    'len': len(val),
                    'raw_repr': repr(item.get(f_num)),
                    'record': item,
                })
                if len(foreign) >= 3:
                    break
        if len(items) < 1000:
            break
        skip += 1000

    return {
        'scanned': scanned,
        'foreign': foreign,
        'ours': [{'value': n, 'len': len(n), 'raw_repr': repr(n)} for n in ours[:3]],
    }


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
    ref_numbers = [str(n or '').strip() for n in ref_numbers if str(n or '').strip()]

    known = payload.get('gtd_refs') or {}
    gtd_cache = {str(k).strip(): v for k, v in known.items() if v}
    lost = [n for n in set(ref_numbers) if n not in gtd_cache]
    if lost:
        gtd_cache.update(lookup_gtd(cfg, lost))
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
    if entity.startswith('Document_'):
        call_odata(cfg, f"{entity}(guid'{key}')/Unpost", method='POST', raw=True)
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

    if action == 'site_lookup':
        return resp(200, {'result': site_lookup(body.get('site') or '', body.get('article') or '')})

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

    if action == 'nomen_match':
        return resp(200, {'result': nomen_match(
            cfg, body.get('rows') or [], mode=body.get('mode') or 'single', by=body.get('by') or 'article',
            exact=body.get('exact', True) is not False, check_barcodes=bool(body.get('check_barcodes')),
        )})

    if action == 'nomen_refs':
        refs, err = nomen_refs(cfg)
        return resp(200, {'result': {'ok': not err, 'refs': refs, 'error': err}})

    if action == 'nomen_create':
        return resp(200, {'result': nomen_create(cfg, body.get('rows') or [], bool(body.get('force')))})

    if action == 'nomen_attach_barcode':
        key = str(body.get('key') or '').strip()
        bc = str(body.get('barcode') or '').strip()
        if not re.fullmatch(r'[0-9a-f-]{36}', key) or not bc:
            return resp(400, {'error': 'Нужны карточка и штрихкод'})
        return resp(200, {'result': dict({'ok': True}, **write_barcode(cfg, key, bc))})

    if action == 'nomen_set_prices':
        return resp(200, {'result': nomen_set_prices(cfg, body.get('rows') or [], body.get('comment') or '')})

    if action == 'nomen_groups':
        return resp(200, {'result': nomen_groups(cfg)})

    if action == 'nomen_tnved':
        return resp(200, {'result': nomen_tnved(cfg, body.get('kinds') or [])})

    if action == 'nomen_add_barcodes':
        return resp(200, {'result': nomen_add_barcodes(cfg, body.get('rows') or [])})

    if action == 'nomen_schema':
        return resp(200, {'result': nomen_schema(cfg)})

    if action == 'odata_read':
        path = params.get('path') or ''
        if path == '$metadata_sets':
            r = call_odata(cfg, '$metadata', raw=True)
            sets = re.findall(r'<EntitySet Name="([^"]+)"', r.get('text') or '')
            q = (params.get('q') or '').lower()
            return resp(200, {'result': [s for s in sets if q in s.lower()]})
        return resp(200, {'result': call_odata(cfg, path)})

    if action == 'gtd_schema':
        return resp(200, {'result': gtd_schema(cfg)})

    if action == 'repair_gtd':
        return resp(200, {'result': repair_gtd(cfg)})

    if action == 'check_gtd':
        return resp(200, {'result': check_gtd(cfg, body.get('numbers') or [])})

    if action == 'gtd_probe':
        return resp(200, {'result': gtd_probe(cfg, body.get('numbers') or [])})

    if action == 'gtd_fix_all':
        return resp(200, {'result': gtd_fix_all(cfg, body.get('numbers') or [])})

    if action == 'gtd_foreign':
        return resp(200, {'result': gtd_foreign(cfg, body.get('numbers') or [])})

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