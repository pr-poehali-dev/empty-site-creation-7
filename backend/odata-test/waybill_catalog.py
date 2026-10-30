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

ART_RX = [
    re.compile(r'\b([А-ЯA-Z]{2,4}-\d{2,6}(?:-{1,2}[\dA-Za-zА-Яа-я]{1,6})?)\b'),
    re.compile(r'\b([A-ZА-Я]{2,}\d{3,})\b'),
    re.compile(r'\b([A-ZА-Я]{1,4}-[A-ZА-Я0-9]*\d[A-ZА-Я0-9]*(?:-[A-ZА-Я0-9]{1,6})?)\b'),
]


def art_from_name(name):
    s = ' '.join(str(name or '').split())
    for rx in ART_RX:
        m = rx.findall(s)
        if m:
            return m[-1]
    return ''


def norm_art(v):
    return re.sub(r'[\s\-_./]+', '', str(v or '')).upper()


def _core(v):
    parts = [p for p in re.split(r'[^0-9A-Za-zА-Яа-яЁё]+', str(v or '')) if p]
    return max(parts, key=len) if parts else ''


def _article_twins(call, wanted):
    """Карточки номенклатуры, у которых артикул совпадает с wanted (без учёта регистра, пробелов, дефисов)."""
    cores = sorted({_core(a) for a in wanted if _core(a)})
    targets = {norm_art(a) for a in wanted}
    out = {}

    def load(core):
        r = call("Catalog_Номенклатура?$format=json&$top=50&$select=Ref_Key,Description,Артикул,Parent_Key,DeletionMark"
                 f"&$filter=IsFolder eq false and substringof('{_q(core)}',Артикул) eq true")
        return r['data'].get('value') or [] if r['ok'] else []

    with ThreadPoolExecutor(max_workers=8) as ex:
        for rows in ex.map(load, cores):
            for x in rows:
                n = norm_art(x.get('Артикул'))
                if n in targets and not x.get('DeletionMark'):
                    out.setdefault(n, {})[x['Ref_Key']] = x
    return out


def find_twins(call, body):
    """Карточки 1С с тем же артикулом (без учёта регистра, пробелов, дефисов)."""
    arts = [str(a or '').strip() for a in (body.get('articles') or []) if str(a or '').strip()][:60]
    twins = _article_twins(call, arts)
    group_name = _groups(call)
    out = {}
    for a in arts:
        n = norm_art(a)
        out[a] = [{'key': k, 'name': (x.get('Description') or '').strip(), 'article': (x.get('Артикул') or '').strip(),
                   'group': group_name(x.get('Parent_Key'))} for k, x in (twins.get(n) or {}).items()]
    return {'twins': out}, None


def set_articles(call, body):
    """Записывает артикулы в карточки номенклатуры, только если там артикул пустой."""
    rows = [r for r in (body.get('rows') or []) if _guid(r.get('key')) and str(r.get('article') or '').strip()][:500]

    def one(r):
        k, art = r['key'], str(r['article']).strip()[:50]
        g = call(f"Catalog_Номенклатура(guid'{k}')?$format=json&$select=Ref_Key,Артикул")
        if not g['ok']:
            return {'key': k, 'state': 'error', 'error': g.get('error')}
        if (g['data'].get('Артикул') or '').strip():
            return {'key': k, 'state': 'skipped', 'article': g['data'].get('Артикул').strip()}
        w = call(f"Catalog_Номенклатура(guid'{k}')?$format=json", method='PATCH', payload={'Артикул': art})
        if not w['ok']:
            return {'key': k, 'state': 'error', 'error': w.get('error')}
        return {'key': k, 'state': 'written', 'article': art}

    with ThreadPoolExecutor(max_workers=8) as ex:
        res = list(ex.map(one, rows))
    return {'results': res}, None


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

    autos = {}
    for k in order:
        c = cards.get(k) or {}
        if not (c.get('Артикул') or '').strip():
            a = art_from_name(c.get('Description'))
            if a:
                autos[k] = a
    out = []
    for k in order:
        it = items[k]
        c = cards.get(k) or {}
        t = tnved.get(c.get(f['tnved'])) or {}
        distinct = sorted({p['price'] for p in it['prices']})
        auto = autos.get(k, '')
        out.append({
            'key': k,
            'name': (c.get('Description') or '').strip(),
            'article': (c.get('Артикул') or '').strip() or auto,
            'article_auto': bool(auto),
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
