"""Файл для «Загрузки каталога» из накладных 1С: список накладных и сборка товаров без дублей."""
import re
from concurrent.futures import ThreadPoolExecutor

EMPTY = '00000000-0000-0000-0000-000000000000'

ENTITIES = {
    'unf': {'sale': 'Document_РасходнаяНакладная', 'receipt': 'Document_ПриходнаяНакладная'},
    'trade': {'sale': 'Document_РеализацияТоваровУслуг', 'receipt': 'Document_ПоступлениеТоваровУслуг'},
}
TABLES = {'unf': 'Запасы', 'trade': 'Товары'}
FIELDS = {
    'unf': {'tnved': 'ТоварнаяНоменклатураВЭД_Key', 'weight': 'Вес'},
    'trade': {'tnved': 'КодТНВЭД_Key', 'weight': 'ВесПоСертификатуТовара'},
}
MAX_DOCS = 60


def _q(v):
    return str(v or '').replace("'", "''")


def _num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _guid(v):
    return isinstance(v, str) and bool(re.fullmatch(r'[0-9a-f-]{36}', v)) and v != EMPTY


def _names(call, entity, keys, field='Description', extra='', size=30):
    keys = [k for k in dict.fromkeys(keys) if _guid(k)]
    out = {}

    def load(chunk):
        flt = ' or '.join(f"Ref_Key eq guid'{k}'" for k in chunk)
        r = call(f"{entity}?$format=json&$select=Ref_Key,{field}{extra}&$filter={flt}")
        if not r['ok']:
            raise RuntimeError(r.get('error') or 'Ошибка чтения из 1С')
        return r['data'].get('value') or []

    chunks = [keys[i:i + size] for i in range(0, len(keys), size)]
    with ThreadPoolExecutor(max_workers=8) as ex:
        for rows in ex.map(load, chunks):
            for x in rows:
                out[x['Ref_Key']] = x
    return out


def list_docs(call, kind, body):
    """Накладные за период (без помеченных на удаление) с контрагентом, суммой и комментарием."""
    doc_type = 'receipt' if body.get('doc_type') == 'receipt' else 'sale'
    entity = ENTITIES[kind][doc_type]
    flt = ['DeletionMark eq false']
    if body.get('date_from'):
        flt.append(f"Date ge datetime'{str(body['date_from'])[:10]}T00:00:00'")
    if body.get('date_to'):
        flt.append(f"Date le datetime'{str(body['date_to'])[:10]}T23:59:59'")
    r = call(f"{entity}?$format=json&$select=Ref_Key,Number,Date,Posted,Контрагент_Key,СуммаДокумента,Комментарий"
             f"&$filter={' and '.join(flt)}&$orderby=Date desc&$top=1000")
    if not r['ok']:
        return None, r.get('error')
    docs = r['data'].get('value') or []
    names = _names(call, 'Catalog_Контрагенты', [d.get('Контрагент_Key') for d in docs])
    return {'docs': [{
        'key': d['Ref_Key'],
        'number': (d.get('Number') or '').strip(),
        'date': d.get('Date'),
        'posted': bool(d.get('Posted')),
        'counterparty': (names.get(d.get('Контрагент_Key')) or {}).get('Description', ''),
        'amount': _num(d.get('СуммаДокумента')),
        'comment': (d.get('Комментарий') or '').strip(),
    } for d in docs]}, None


def _barcodes(call, keys):
    keys = [k for k in dict.fromkeys(keys) if _guid(k)]
    out = {}

    def load(chunk):
        flt = ' or '.join(f"Номенклатура_Key eq guid'{k}'" for k in chunk)
        r = call("InformationRegister_ШтрихкодыНоменклатуры?$format=json&$select=Штрихкод,Номенклатура_Key"
                 f"&$filter={flt}")
        if not r['ok']:
            raise RuntimeError(r.get('error') or 'Ошибка чтения штрихкодов из 1С')
        return r['data'].get('value') or []

    chunks = [keys[i:i + 8] for i in range(0, len(keys), 8)]
    with ThreadPoolExecutor(max_workers=8) as ex:
        for rows in ex.map(load, chunks):
            for x in rows:
                bc = str(x.get('Штрихкод') or '').strip()
                if bc:
                    out.setdefault(x['Номенклатура_Key'], []).append(bc)
    return out


def _groups(call):
    r = call("Catalog_Номенклатура?$format=json&$select=Ref_Key,Description,Parent_Key"
             "&$filter=IsFolder eq true and DeletionMark eq false")
    rows = r['data'].get('value') or [] if r['ok'] else []
    by_key = {x['Ref_Key']: x for x in rows}

    def name(k):
        x = by_key.get(k)
        return (x.get('Description') or '').strip() if x else ''

    return name


def build(call, kind, body):
    """Товары из выбранных накладных без дублей; цена — из самой поздней накладной."""
    doc_type = 'receipt' if body.get('doc_type') == 'receipt' else 'sale'
    entity = ENTITIES[kind][doc_type]
    table = TABLES[kind]
    keys = [k for k in (body.get('keys') or []) if _guid(k)][:MAX_DOCS]
    if not keys:
        return None, 'Не выбраны накладные'

    def load(k):
        r = call(f"{entity}(guid'{k}')?$format=json&$select=Ref_Key,Number,Date,{table}")
        return r

    with ThreadPoolExecutor(max_workers=6) as ex:
        loaded = list(ex.map(load, keys))
    docs = []
    for r in loaded:
        if not r['ok']:
            return None, r.get('error')
        docs.append(r['data'])
    docs.sort(key=lambda d: d.get('Date') or '')

    items, order, lines = {}, [], 0
    for d in docs:
        num = (d.get('Number') or '').strip()
        for row in d.get(table) or []:
            k = row.get('Номенклатура_Key')
            if not _guid(k):
                continue
            lines += 1
            price = round(_num(row.get('Цена')), 2)
            it = items.get(k)
            if not it:
                it = items[k] = {'key': k, 'prices': [], 'qty': 0.0}
                order.append(k)
            qty = _num(row.get('Количество'))
            it['qty'] += qty
            it['prices'].append({'doc': num, 'date': (d.get('Date') or '')[:10], 'price': price})
            if it.get('price_doc') != num:
                it['variants'] = {}
            it['variants'][price] = it['variants'].get(price, 0.0) + qty
            it['price'] = price
            it['price_doc'] = num

    f = FIELDS[kind]
    try:
        return _fill(call, f, items, order, lines, docs), None
    except RuntimeError as e:
        return None, str(e)


def _fill(call, f, items, order, lines, docs):
    cards = _names(call, 'Catalog_Номенклатура', order,
                   field='Description', extra=f",Артикул,Parent_Key,{f['weight']},{f['tnved']}", size=8)
    tnved = _names(call, 'Catalog_КлассификаторТНВЭД', [c.get(f['tnved']) for c in cards.values()], field='Code')
    barcodes = _barcodes(call, order)
    group_name = _groups(call)

    out = []
    for k in order:
        it = items[k]
        c = cards.get(k) or {}
        t = tnved.get(c.get(f['tnved'])) or {}
        distinct = sorted({p['price'] for p in it['prices']})
        out.append({
            'key': k,
            'name': (c.get('Description') or '').strip(),
            'article': (c.get('Артикул') or '').strip(),
            'barcodes': barcodes.get(k, []),
            'group': group_name(c.get('Parent_Key')),
            'weight': _num(c.get(f['weight'])),
            'tnved': str(t.get('Code') or '').strip(),
            'price': it['price'],
            'price_doc': it['price_doc'],
            'qty': it['qty'],
            'price_diff': it['prices'] if len(distinct) > 1 else [],
            'variants': [{'price': p, 'qty': q} for p, q in sorted(it['variants'].items())],
        })
    return {'items': out, 'lines': lines,
            'docs': [{'number': (d.get('Number') or '').strip(), 'date': d.get('Date')} for d in docs]}
