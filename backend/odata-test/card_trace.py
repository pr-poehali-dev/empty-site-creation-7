import re

EMPTY = '00000000-0000-0000-0000-000000000000'
GUID_RX = re.compile(r'[0-9a-f-]{36}')


def _q(v):
    return str(v).replace("'", "''")


def cards_trace(call_odata, run_parallel, keys):
    """Читает страну и признак «Прослеживаемый» у карточек номенклатуры, порциями по 20."""
    keys = [k for k in dict.fromkeys(keys) if GUID_RX.fullmatch(str(k)) and k != EMPTY]
    chunks = [keys[i:i + 20] for i in range(0, len(keys), 20)]

    def load(i):
        flt = ' or '.join(f"Ref_Key eq guid'{k}'" for k in chunks[i])
        r = call_odata(f"Catalog_Номенклатура?$format=json&$select=Ref_Key,СтранаПроисхождения_Key,ПрослеживаемыйТовар"
                       f"&$filter={flt}")
        if not r['ok']:
            return None, r['error']
        return r['data'].get('value', []), None

    out, errors = run_parallel(load, [(i,) for i in range(len(chunks))], workers=4)
    cards = {}
    for part in out.values():
        for x in part or []:
            c = x.get('СтранаПроисхождения_Key') or ''
            cards[x['Ref_Key']] = {'country_key': '' if c == EMPTY else c,
                                   'traceable': bool(x.get('ПрослеживаемыйТовар'))}
    return cards, (next(iter(errors.values())) if errors else None)


def create_country(call_odata, name, code):
    """Создаёт страну в «Странах мира». Если страна с таким кодом уже есть — возвращает её."""
    name = str(name or '').strip().upper()[:100]
    code = str(code or '').strip()
    if not name or not re.fullmatch(r'\d{3}', code):
        return {'name': name, 'code': code, 'state': 'error', 'error': 'нет названия или кода'}
    r = call_odata(f"Catalog_СтраныМира?$format=json&$top=1&$select=Ref_Key,Description"
                   f"&$filter=Code eq '{_q(code)}' and DeletionMark eq false")
    if r['ok'] and r['data'].get('value'):
        v = r['data']['value'][0]
        return {'name': v.get('Description') or name, 'code': code, 'state': 'found', 'key': v['Ref_Key']}
    r = call_odata('Catalog_СтраныМира?$format=json', method='POST',
                   payload={'Description': name, 'Code': code, 'НаименованиеПолное': name})
    if not r['ok']:
        return {'name': name, 'code': code, 'state': 'error', 'error': r['error']}
    return {'name': name, 'code': code, 'state': 'created', 'key': (r.get('data') or {}).get('Ref_Key')}


def update_card(call_odata, key, country_key=None, traceable=None):
    """Меняет у карточки страну и/или признак «Прослеживаемый», затем перечитывает и сверяет."""
    if not GUID_RX.fullmatch(str(key or '')):
        return {'key': key, 'state': 'error', 'error': 'нет карточки'}
    body = {}
    if country_key:
        body['СтранаПроисхождения_Key'] = country_key
    if traceable is not None:
        body['ПрослеживаемыйТовар'] = bool(traceable)
    if not body:
        return {'key': key, 'state': 'skip'}
    path = f"Catalog_Номенклатура(guid'{key}')?$format=json"
    r = call_odata(path, method='PATCH', payload=body)
    if not r['ok']:
        return {'key': key, 'state': 'error', 'error': r['error']}
    g = call_odata(path + '&$select=СтранаПроисхождения_Key,ПрослеживаемыйТовар')
    got = g.get('data') or {} if g['ok'] else {}
    if country_key and got.get('СтранаПроисхождения_Key') != country_key:
        return {'key': key, 'state': 'error', 'error': '1С не сохранила страну'}
    if traceable is not None and bool(got.get('ПрослеживаемыйТовар')) != bool(traceable):
        return {'key': key, 'state': 'error', 'error': '1С не сохранила признак'}
    return {'key': key, 'state': 'ok'}


def trace_apply(call_odata, run_parallel, create, cards):
    """Создаёт недостающие страны и исправляет карточки (не больше 10 за раз)."""
    made = [create_country(call_odata, c.get('name'), c.get('code')) for c in (create or [])[:10]]
    cards = (cards or [])[:10]
    out, errors = run_parallel(
        lambda i: (update_card(call_odata, cards[i].get('key'), cards[i].get('country_key'), cards[i].get('traceable')), None),
        [(i,) for i in range(len(cards))], workers=4)
    updated = []
    for i, c in enumerate(cards):
        res = out.get((i,)) or {'key': c.get('key'), 'state': 'error', 'error': errors.get((i,), 'нет ответа')}
        updated.append(res)
    return {'ok': True, 'countries': made, 'cards': updated}
