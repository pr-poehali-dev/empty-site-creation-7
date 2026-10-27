import requests

API = 'https://api.dashboard.proxy.market'
TIMEOUT = 8


class PMError(Exception):
    pass


def _call(method, path, key, **kw):
    r = requests.request(method, f'{API}{path}/{key}', timeout=TIMEOUT, **kw)
    try:
        data = r.json()
    except ValueError:
        data = {}
    if r.status_code == 403:
        raise PMError('Proxy.Market не принял API-ключ')
    if r.status_code >= 400:
        raise PMError(data.get('message') or f'Proxy.Market ответил ошибкой {r.status_code}')
    return data


def balance(key):
    return _call('GET', '/dev-api/balance', key).get('balance')


def packages(key):
    return _call('GET', '/dev-api/v2/packages', key, params={'page': 1, 'perPage': 50}).get('data') or []


def _ptype(p):
    return ((p.get('product') or {}).get('product_type')) or 'resident'


def active_package(key, kind='resident'):
    best = None
    for p in packages(key):
        if not p.get('is_active', True) or _ptype(p) != kind:
            continue
        left = (p.get('total') or 0) - (p.get('used') or 0)
        if best is None or left > best[0]:
            best = (left, p)
    return best[1] if best else None


def package_proxies(key, package_id, kind='resident'):
    data = _call('POST', '/dev-api/list', key, json={
        'type': 'all', 'proxy_type': kind, 'package_id': package_id,
        'page': 1, 'page_size': 100, 'sort': 0,
    })
    lst = data.get('list') or {}
    return lst.get('data') if isinstance(lst, dict) else (lst or [])


def countries(key):
    return _call('GET', '/dev-api/v2/package/countries', key).get('data') or []


def create_proxy(key, package_id, country, reuse=True, kind='resident'):
    existing = package_proxies(key, package_id, kind)
    if reuse:
        for p in existing:
            if str(p.get('country', '')).lower() == country:
                return p
    before = {p.get('id') for p in existing}
    _call('POST', '/dev-api/v2/package/create-proxy', key, json={
        'packageId': package_id, 'country': country, 'rotation': 0,
    })
    for p in package_proxies(key, package_id, kind):
        if p.get('id') not in before and str(p.get('country', '')).lower() == country:
            return p
    for p in package_proxies(key, package_id, kind):
        if str(p.get('country', '')).lower() == country:
            return p
    raise PMError('Прокси создан, но не найден в списке пакета')


def proxy_url(p):
    host = p.get('ip')
    port = p.get('http_port')
    if not host or not port:
        raise PMError('У прокси нет адреса или порта')
    login, pwd = p.get('login'), p.get('password')
    auth = f'{login}:{pwd}@' if login else ''
    return f'http://{auth}{host}:{port}'