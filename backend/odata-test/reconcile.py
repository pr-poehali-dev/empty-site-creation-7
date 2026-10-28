"""Сверка счёта на оплату с накладной (реализация/поступление) по данным 1С."""
from concurrent.futures import ThreadPoolExecutor

EMPTY = '00000000-0000-0000-0000-000000000000'

CANDIDATES = {
    'sale': {
        'waybill': ['Document_РеализацияТоваровУслуг', 'Document_РасходнаяНакладная'],
        'invoice': ['Document_СчетНаОплатуПокупателю', 'Document_СчетНаОплату'],
    },
    'receipt': {
        'waybill': ['Document_ПоступлениеТоваровУслуг', 'Document_ПриходнаяНакладная'],
        'invoice': ['Document_СчетНаОплатуПоставщика', 'Document_СчетПоставщика'],
    },
}
_SETS = {}


def _modes(call):
    """Имена документов берутся из $metadata базы: в разных конфигурациях 1С они разные."""
    if 'sets' not in _SETS:
        import re
        r = call('$metadata', raw=True)
        _SETS['sets'] = set(re.findall(r'<EntitySet Name="([^"]+)"', r.get('text') or ''))
    sets = _SETS['sets']
    out = {}
    for mode, kinds in CANDIDATES.items():
        out[mode] = {k: next((e for e in c if e in sets), c[0]) for k, c in kinds.items()}
    return out
TABLES = ['Запасы', 'Товары', 'ТоварыУслуги', 'ТоварыИУслуги', 'Услуги']
HEAD = ['Ref_Key', 'Number', 'Date', 'Posted', 'DeletionMark', 'Контрагент_Key', 'СуммаДокумента',
        'ДокументОснование', 'ДокументОснование_Type', 'Комментарий']
ITEM = ('Номенклатура_Key', 'Номенклатура')


def _item(row):
    for f in ITEM:
        v = row.get(f)
        if v:
            return v
    return EMPTY


def _has_item(row):
    return isinstance(row, dict) and any(f in row for f in ITEM)
EPS = 0.005


def _num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _q(v):
    return str(v or '').replace("'", "''")


def _fields(call, entity):
    r = call(f'{entity}?$top=1&$format=json')
    if not r['ok']:
        return None, r.get('error')
    rows = r['data'].get('value') or []
    return (set(rows[0].keys()) if rows else set(HEAD)), None


def _names(call, entity, keys, field='Description'):
    keys = [k for k in dict.fromkeys(keys) if k and k != EMPTY]
    out = {}

    def load(chunk):
        flt = ' or '.join(f"Ref_Key eq guid'{k}'" for k in chunk)
        r = call(f"{entity}?$format=json&$select=Ref_Key,{field}&$filter={flt}")
        return r['data'].get('value') or [] if r['ok'] else []

    chunks = [keys[i:i + 40] for i in range(0, len(keys), 40)]
    if chunks:
        with ThreadPoolExecutor(max_workers=8) as ex:
            for rows in ex.map(load, chunks):
                for x in rows:
                    out[x['Ref_Key']] = x.get(field) or ''
    return out


def _head_view(d, names):
    return {
        'key': d.get('Ref_Key'),
        'number': (d.get('Number') or '').strip(),
        'date': d.get('Date'),
        'posted': bool(d.get('Posted')),
        'counterparty': names.get(d.get('Контрагент_Key'), ''),
        'amount': _num(d.get('СуммаДокумента')),
    }


def _base_invoice(d, invoice_entity):
    """Ключ счёта, на основании которого создана накладная (шапка или строки)."""
    t = str(d.get('ДокументОснование_Type') or '')
    k = d.get('ДокументОснование')
    if k and k != EMPTY and (not t or invoice_entity in t):
        return k
    for f, v in d.items():
        if f.startswith('СчетНаОплату') and f.endswith('_Key') and v and v != EMPTY:
            return v
    for name in TABLES:
        for row in d.get(name) or []:
            for f, v in row.items():
                if f.startswith('СчетНаОплату') and f.endswith('_Key') and v and v != EMPTY:
                    return v
    return None


def list_docs(call, body):
    mode = _modes(call).get(body.get('mode'))
    if not mode:
        return None, 'Неизвестный режим'
    kind = 'invoice' if body.get('kind') == 'invoice' else 'waybill'
    entity = mode[kind]
    avail, err = _fields(call, entity)
    if err:
        return None, err
    sel = ','.join([f for f in HEAD if f in avail] +
                   [f for f in avail if f.startswith('СчетНаОплату') and f.endswith('_Key')])
    flt = ['DeletionMark eq false']
    q = str(body.get('q') or '').strip()
    if q:
        flt.append(f"substringof('{_q(q)}', Number)")
    else:
        if body.get('date_from'):
            flt.append(f"Date ge datetime'{body['date_from'][:10]}T00:00:00'")
        if body.get('date_to'):
            flt.append(f"Date le datetime'{body['date_to'][:10]}T23:59:59'")
    r = call(f"{entity}?$format=json&$select={sel}&$filter={' and '.join(flt)}&$orderby=Date desc&$top=100")
    if not r['ok']:
        return None, r.get('error')
    docs = r['data'].get('value') or []
    names = _names(call, 'Catalog_Контрагенты', [d.get('Контрагент_Key') for d in docs])
    out = []
    for d in docs:
        v = _head_view(d, names)
        if kind == 'waybill':
            v['invoice_key'] = _base_invoice(d, mode['invoice'])
        out.append(v)
    return {'docs': out}, None


def _load_doc(call, entity, key):
    r = call(f"{entity}(guid'{key}')?$format=json")
    if not r['ok']:
        return None, r.get('error')
    return r['data'], None


def _table(d):
    for name in TABLES:
        rows = d.get(name)
        if isinstance(rows, list) and rows and _has_item(rows[0]):
            return rows
    for v in d.values():
        if isinstance(v, list) and v and _has_item(v[0]):
            return v
    return []


def _lines(rows, vat_included=True):
    """Строки документа по товарам — без объединения, с номерами строк."""
    out = {}
    for i, r in enumerate(rows):
        qty = _num(r.get('Количество'))
        amount = _num(r.get('Сумма'))
        vat = _num(r.get('СуммаНДС'))
        total = _num(r.get('Всего')) if 'Всего' in r else (amount if vat_included else amount + vat)
        out.setdefault(_item(r), []).append({
            'line': int(_num(r.get('LineNumber')) or i + 1),
            'qty': round(qty, 3), 'price': round(_num(r.get('Цена')), 2),
            'amount': round(amount, 2), 'vat': round(vat, 2), 'total': round(total, 2),
        })
    return out


def _pair(xs, ys):
    """Сначала точные совпадения кол-во+цена, потом по сумме, остальное — по порядку строк."""
    xs, ys = list(xs), list(ys)
    pairs = []
    for keyf in (lambda r: (r['qty'], r['price'], r['amount']), lambda r: (r['qty'], r['price']), lambda r: r['amount']):
        for x in list(xs):
            y = next((y for y in ys if keyf(y) == keyf(x)), None)
            if y:
                pairs.append((x, y))
                xs.remove(x)
                ys.remove(y)
    n = min(len(xs), len(ys))
    pairs += list(zip(xs[:n], ys[:n]))
    pairs += [(x, None) for x in xs[n:]] + [(None, y) for y in ys[n:]]
    pairs.sort(key=lambda p: (p[0] or p[1])['line'])
    return pairs


FIELDS = ('qty', 'price', 'amount', 'vat', 'total')


def compare(call, body):
    mode = _modes(call).get(body.get('mode'))
    if not mode:
        return None, 'Неизвестный режим'
    wkey = body.get('waybill_key')
    if not wkey:
        return None, 'Выберите накладную'
    ikey = body.get('invoice_key')
    with ThreadPoolExecutor(max_workers=2) as ex:
        fw = ex.submit(_load_doc, call, mode['waybill'], wkey)
        fi = ex.submit(_load_doc, call, mode['invoice'], ikey) if ikey else None
        w, err = fw.result()
        inv, ierr = fi.result() if fi else (None, None)
    if err:
        return None, f'Накладная: {err}'
    if not ikey:
        ikey = _base_invoice(w, mode['invoice'])
        if not ikey:
            return {'need_invoice': True, 'waybill': _head_view(w, _names(call, 'Catalog_Контрагенты', [w.get('Контрагент_Key')]))}, None
        inv, ierr = _load_doc(call, mode['invoice'], ikey)
    if ierr:
        return None, f'Счёт: {ierr}'
    a = _lines(_table(inv), inv.get('СуммаВключаетНДС', True) is not False)
    b = _lines(_table(w), w.get('СуммаВключаетНДС', True) is not False)
    with ThreadPoolExecutor(max_workers=2) as ex:
        fn = ex.submit(_names, call, 'Catalog_Номенклатура', list(a) + list(b))
        fc = ex.submit(_names, call, 'Catalog_Контрагенты', [w.get('Контрагент_Key'), inv.get('Контрагент_Key')])
        names, cps = fn.result(), fc.result()
    rows = []
    for k in list(dict.fromkeys(list(a) + list(b))):
        name = names.get(k) or ('(без номенклатуры)' if k == EMPTY else k)
        for x, y in _pair(a.get(k, []), b.get(k, [])):
            if x and y:
                diff = [f for f in FIELDS if abs(x[f] - y[f]) > EPS]
                status = 'diff' if diff else 'ok'
            else:
                diff, status = [], 'only_invoice' if x else 'only_waybill'
            rows.append({'key': f"{k}:{x['line'] if x else '-'}:{y['line'] if y else '-'}", 'name': name,
                         'invoice': x, 'waybill': y, 'status': status, 'diff': diff})
    order = {'only_invoice': 0, 'only_waybill': 1, 'diff': 2, 'ok': 3}
    rows.sort(key=lambda r: (order[r['status']], (r['invoice'] or r['waybill'])['line']))

    def totals(g):
        flat = [r for v in g.values() for r in v]
        return {f: round(sum(r[f] for r in flat), 3 if f == 'qty' else 2) for f in ('qty', 'amount', 'vat', 'total')}

    ih, wh = _head_view(inv, cps), _head_view(w, cps)
    return {
        'invoice': ih,
        'waybill': wh,
        'linked': not body.get('invoice_key'),
        'same_counterparty': inv.get('Контрагент_Key') == w.get('Контрагент_Key'),
        'rows': rows,
        'totals': {'invoice': totals(a), 'waybill': totals(b)},
        'counts': {s: sum(1 for r in rows if r['status'] == s) for s in order},
    }, None
