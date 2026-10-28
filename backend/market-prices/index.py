import json
import os
import re

import psycopg2
from psycopg2.extras import RealDictCursor

import filters as F
import proxymarket as pm
import vps
from sources import SITES, Blocked, NoTraffic, clean_model, pick_min, product_url, search

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}

TOTALS = {
    'total_ru': [s for s, v in SITES.items() if v['country'] == 'ru'],
    'total_by': [s for s, v in SITES.items() if v['country'] == 'by'],
}

COLS = (
    'brand_key, model_key, brand, model, '
    + ', '.join(f'{s}, {s}_status, {s}_at, {s}_title, {s}_url, {s}_suspect, {s}_confirmed' for s in SITES)
    + ', total_ru, total_ru_manual, total_by, total_by_manual, updated_at'
)

PROVIDER = 'proxy_market'
METHODS = ('direct', 'proxy', 'browser')
BROWSER_SITES = ('wb_ru', 'wb_by', 'oz_ru', 'oz_by')


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json', **CORS},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _esc(s):
    return str(s).replace("'", "''")


def _lit(v):
    return 'NULL' if v is None else f"'{_esc(v)}'"


def keys(brand, model):
    b = re.sub(r'\s+', ' ', (brand or '').strip().lower())
    m = re.sub(r'\s+', ' ', clean_model(brand, model).lower())
    return b, m


def who(cur, token):
    token = (token or '').replace('Bearer ', '').strip()
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role, u.phone FROM users u JOIN user_sessions s ON s.user_id=u.id "
        f"WHERE s.token='{_esc(token)}' AND s.expires_at > NOW() LIMIT 1"
    )
    u = cur.fetchone()
    if not u:
        return None
    cur.execute(f"SELECT id, role_id FROM managers WHERE phone='{_esc(u['phone'])}' LIMIT 1")
    m = cur.fetchone() or {}
    return {'is_owner': u['role'] == 'owner', 'manager_id': m.get('id'), 'role_id': m.get('role_id')}


def perms_of(cur, actor):
    result = {}
    for col, val in (('role_id', actor['role_id']), ('manager_id', actor['manager_id'])):
        if val:
            cur.execute(
                f"SELECT perm_key, enabled FROM receiving_permissions WHERE {col}={int(val)}"
            )
            for r in cur.fetchall():
                result[r['perm_key']] = r['enabled']
    return result


# ---------- настройки ----------

def proxy_row(cur):
    cur.execute(f"SELECT * FROM market_proxy_settings WHERE provider='{PROVIDER}'")
    row = cur.fetchone()
    if row:
        if not row['api_key'] and os.environ.get('PROXY_MARKET_API_KEY'):
            cur.execute(
                f"UPDATE market_proxy_settings SET api_key={_lit(os.environ['PROXY_MARKET_API_KEY'])} "
                f"WHERE provider='{PROVIDER}'"
            )
            cur.execute(f"SELECT * FROM market_proxy_settings WHERE provider='{PROVIDER}'")
            row = cur.fetchone()
        return row
    key = os.environ.get('PROXY_MARKET_API_KEY') or None
    cur.execute(
        f"INSERT INTO market_proxy_settings (provider, api_key) VALUES ('{PROVIDER}', {_lit(key)}) "
        f"ON CONFLICT (provider) DO NOTHING"
    )
    cur.execute(f"SELECT * FROM market_proxy_settings WHERE provider='{PROVIDER}'")
    return cur.fetchone()


def site_rows(cur):
    cur.execute("SELECT * FROM market_site_settings")
    return {r['site']: r for r in cur.fetchall()}


def enabled_sites(cur):
    rows = site_rows(cur)
    return [s for s in SITES if rows.get(s, {}).get('enabled', True)]


def _mask(key):
    return f'••••{key[-4:]}' if key else ''


def proxy_info(cur, live):
    row = proxy_row(cur)
    info = {
        'provider': PROVIDER,
        'title': 'Proxy.Market',
        'has_key': bool(row['api_key']),
        'key_mask': _mask(row['api_key']),
        'package_id': row['package_id'],
        'proxy_ru': bool(row['proxy_ru']),
        'proxy_by': bool(row['proxy_by']),
        'proxy_ru_host': re.sub(r':[^:@/]*@', '@', row['proxy_ru'] or ''),
        'proxy_by_host': re.sub(r':[^:@/]*@', '@', row['proxy_by'] or ''),
        'proxy_ru_mobile': bool(row.get('proxy_ru_mobile')),
        'proxy_by_mobile': bool(row.get('proxy_by_mobile')),
    }
    if live and row['api_key']:
        try:
            info['balance'] = pm.balance(row['api_key'])
            for field, kind in (('package', 'resident'), ('mobile_package', 'mobile')):
                pkg = pm.active_package(row['api_key'], kind)
                if pkg:
                    info[field] = {
                        'id': pkg.get('id'), 'name': pkg.get('name'), 'total': pkg.get('total'),
                        'used': pkg.get('used'), 'expires_at': pkg.get('expires_at'),
                        'prepaid': pkg.get('prepaid'),
                    }
        except Exception as e:
            info['error'] = str(e)
    return info


def settings(cur, live=True):
    rows = site_rows(cur)
    sites = []
    for key, meta in SITES.items():
        r = rows.get(key) or {}
        sites.append({
            'site': key, **meta,
            'enabled': r.get('enabled', True), 'via_proxy': r.get('via_proxy', True),
            'method': r.get('method') or 'proxy',
            'test_brand': r.get('test_brand') or 'Blackton', 'test_model': r.get('test_model') or 'TP536',
            'last_status': r.get('last_status'), 'last_message': r.get('last_message'),
            'last_price': r.get('last_price'), 'last_title': r.get('last_title'), 'last_at': r.get('last_at'),
        })
    return {'proxies': [proxy_info(cur, live)], 'sites': sites}


def save_key(cur, body):
    key = (body.get('api_key') or '').strip()
    if not key:
        return None, 'Введите API-ключ'
    proxy_row(cur)
    try:
        pm.balance(key)
    except pm.PMError as e:
        return None, str(e)
    cur.execute(
        f"UPDATE market_proxy_settings SET api_key={_lit(key)}, package_id=NULL, proxy_ru=NULL, "
        f"proxy_ru_id=NULL, proxy_by=NULL, proxy_by_id=NULL, updated_at=NOW() WHERE provider='{PROVIDER}'"
    )
    return settings(cur), None


def create_proxies(cur, body):
    row = proxy_row(cur)
    if not row['api_key']:
        return None, 'Сначала сохраните API-ключ'
    which = [c for c in (body.get('countries') or ['ru', 'by']) if c in ('ru', 'by')]
    missing = []
    try:
        pkg = pm.active_package(row['api_key'])
        mob = pm.active_package(row['api_key'], 'mobile')
        if not pkg and not mob:
            return None, 'В Proxy.Market нет активного пакета трафика — купите резидентские прокси'
        allowed = [str(c).lower() for c in pm.countries(row['api_key'])]
        sets = []
        if pkg:
            sets.append(f"package_id={int(pkg['id'])}")
        if mob:
            sets.append(f"mobile_package_id={int(mob['id'])}")
        for c in which:
            if allowed and c not in allowed:
                missing.append('Беларусь' if c == 'by' else 'Россия')
                continue
            if pkg:
                p = pm.create_proxy(row['api_key'], int(pkg['id']), c, reuse=not body.get('recreate'))
                sets.append(f"proxy_{c}={_lit(pm.proxy_url(p))}, proxy_{c}_id={int(p.get('id') or 0)}")
            if mob:
                p = pm.create_proxy(row['api_key'], int(mob['id']), c, reuse=not body.get('recreate'), kind='mobile')
                sets.append(f"proxy_{c}_mobile={_lit(pm.proxy_url(p))}")
    except pm.PMError as e:
        return None, str(e)
    cur.execute(
        f"UPDATE market_proxy_settings SET {', '.join(sets)}, updated_at=NOW() WHERE provider='{PROVIDER}'"
    )
    data = settings(cur)
    if missing:
        data['warning'] = f"Proxy.Market не даёт страну: {', '.join(missing)}"
    return data, None


def save_site(cur, body):
    site = body.get('site')
    if site not in SITES:
        return None, 'Неизвестный сайт'
    sets = []
    for f in ('enabled', 'via_proxy'):
        if f in body:
            sets.append(f"{f}={'TRUE' if body[f] else 'FALSE'}")
    if body.get('method') in METHODS:
        sets.append(f"method='{body['method']}', via_proxy={'FALSE' if body['method'] == 'direct' else 'TRUE'}")
    for f in ('test_brand', 'test_model'):
        if f in body and str(body[f]).strip():
            sets.append(f"{f}={_lit(str(body[f]).strip())}")
    if sets:
        cur.execute(
            f"INSERT INTO market_site_settings (site) VALUES ('{site}') ON CONFLICT (site) DO NOTHING"
        )
        cur.execute(f"UPDATE market_site_settings SET {', '.join(sets)} WHERE site='{site}'")
    return settings(cur, live=False), None


# ---------- поиск ----------

def ensure_mobile(cur, row, country):
    if not row.get('api_key'):
        return None
    try:
        pkg = pm.active_package(row['api_key'], 'mobile')
        if not pkg:
            return None
        p = pm.create_proxy(row['api_key'], int(pkg['id']), country, reuse=True, kind='mobile')
        url = pm.proxy_url(p)
    except pm.PMError as e:
        print(f'mobile proxy {country}: {e}')
        return None
    cur.execute(
        f"UPDATE market_proxy_settings SET mobile_package_id={int(pkg['id'])}, proxy_{country}_mobile={_lit(url)}, "
        f"updated_at=NOW() WHERE provider='{PROVIDER}'"
    )
    return url


def site_method(cur, site):
    r = site_rows(cur).get(site) or {}
    m = r.get('method') or ('proxy' if r.get('via_proxy', True) else 'direct')
    if m == 'browser' and site not in BROWSER_SITES:
        m = 'proxy'
    return m


def proxy_for(cur, site, need=False):
    if not need and site_method(cur, site) == 'direct':
        return None, None
    row = proxy_row(cur)
    country = SITES[site]['country']
    url = row.get(f'proxy_{country}')
    if site.startswith('oz_') and need:
        mobile = row.get(f'proxy_{country}_mobile') or ensure_mobile(cur, row, country)
        if mobile:
            url = mobile
    if not url:
        name = 'Беларусь' if country == 'by' else 'Россия'
        return None, f'Не создан прокси «{name}» — откройте Настройки'
    return url, None


def _skipper(cur, site, brand, model):
    if not brand and not model:
        return None
    b, m = keys(brand, model)
    cur.execute(
        f"SELECT url, title FROM market_excluded WHERE brand_key={_lit(b)} AND model_key={_lit(m)} "
        f"AND site='{site}'"
    )
    rows = cur.fetchall()
    if not rows:
        return None
    urls = {r['url'] for r in rows if r['url']}
    titles = {(r['title'] or '').strip().lower() for r in rows if not r['url'] and r['title']}

    def skip(ref, title):
        u = product_url(site, ref)
        if u and u in urls:
            return True
        return (title or '').strip().lower() in titles
    return skip


def run_search(cur, site, brand, model, group=''):
    """Возвращает (status, price, title, message, url)."""
    method = site_method(cur, site)
    proxy, err = proxy_for(cur, site, need=method == 'browser')
    if err:
        return 'no_proxy', None, None, err, None
    rules = F.Rules(F.load(cur), group)
    skip = _skipper(cur, site, brand, model)
    if method == 'browser':
        m = clean_model(brand, model)
        status, cards, msg = vps.search(cur, site, f'{brand} {m}'.strip(), proxy)
        if status != 'ok':
            return status, None, None, msg, None
        found = pick_min(cards, m, rules, skip)
    else:
        try:
            found = search(site, brand, model, proxy, rules, skip)
        except NoTraffic as e:
            return 'no_traffic', None, None, str(e), None
        except Blocked as e:
            return 'blocked', None, None, str(e), None
        except Exception as e:
            print(f'{site} {brand} {model}: {e}')
            return 'error', None, None, 'Сайт ответил ошибкой или не успел ответить', None
    if not found:
        return 'not_found', None, None, 'Точной модели не найдено', None
    title, price, ref = found
    return 'ok', price, title, '', product_url(site, ref)


def test_site(cur, body):
    site = body.get('site')
    if site not in SITES:
        return None, 'Неизвестный сайт'
    r = site_rows(cur).get(site) or {}
    brand = r.get('test_brand') or 'Blackton'
    model = r.get('test_model') or 'TP536'
    status, price, title, msg, _url = run_search(cur, site, brand, model)
    cur.execute(
        f"UPDATE market_site_settings SET last_status='{status}', last_message={_lit(msg)}, "
        f"last_price={_lit(price)}, last_title={_lit(title)}, last_at=NOW() WHERE site='{site}'"
    )
    return settings(cur, live=False), None


def get_row(cur, b, m):
    cur.execute(
        f"SELECT {COLS} FROM model_market_prices WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
    )
    return cur.fetchone()


def ensure_row(cur, brand, model):
    b, m = keys(brand, model)
    cur.execute(
        f"INSERT INTO model_market_prices (brand_key, model_key, brand, model) "
        f"VALUES ({_lit(b)}, {_lit(m)}, {_lit(brand)}, {_lit(clean_model(brand, model))}) "
        f"ON CONFLICT (brand_key, model_key) DO NOTHING"
    )
    return b, m


def recalc(cur, b, m):
    """Подозрительные цены (сильно ниже средней остальных сайтов) помечаются и не идут в итог,
    пока их не подтвердят. Итог страны — средняя остальных найденных цен этой страны."""
    row = get_row(cur, b, m)
    plaus = F.load(cur)['plaus']
    sets = []
    vals_all = {s: float(row[s]) for s in SITES if row[s] is not None}
    for s in SITES:
        susp = False
        if s in vals_all and plaus.get('cross_on') and not row[f'{s}_confirmed']:
            same = [v for k, v in vals_all.items() if k != s and SITES[k]['country'] == SITES[s]['country']]
            if same:
                avg = sum(same) / len(same)
                susp = vals_all[s] * float(plaus.get('cross_ratio') or 2) < avg
        if bool(row[f'{s}_suspect']) != susp:
            sets.append(f"{s}_suspect={'TRUE' if susp else 'FALSE'}")
            row[f'{s}_suspect'] = susp
    for total, sites in TOTALS.items():
        vals = [vals_all[s] for s in sites if s in vals_all and not row[f'{s}_suspect']]
        if vals:
            sets.append(f"{total}={round(sum(vals) / len(vals), 2)}, {total}_manual=FALSE")
        elif row[total] is not None and not row[f'{total}_manual']:
            sets.append(f"{total}=NULL")
    if sets:
        cur.execute(
            f"UPDATE model_market_prices SET {', '.join(sets)}, updated_at=NOW() "
            f"WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
        )


def group_of(cur, brand, model):
    """Товарная группа позиции из каталога приёмки — для сверки типа товара."""
    cur.execute(
        f"SELECT btrim(product_group) AS g, COUNT(*) AS n FROM receiving_items "
        f"WHERE lower(btrim(COALESCE(brand,'')))=lower({_lit((brand or '').strip())}) "
        f"AND lower(btrim(COALESCE(model,'')))=lower({_lit((model or '').strip())}) "
        f"AND btrim(COALESCE(product_group,''))<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 1"
    )
    r = cur.fetchone()
    return r['g'] if r else ''


def fetch_price(cur, body):
    site = body.get('site')
    brand, model = body.get('brand') or '', body.get('model') or ''
    if site not in SITES or not clean_model(brand, model):
        return None, 'Нужны сайт, бренд и модель'
    b, m = ensure_row(cur, brand, model)
    status, price, title, msg, url = run_search(cur, site, brand, model, body.get('group') or group_of(cur, brand, model))
    if status in ('ok', 'not_found'):
        cur.execute(
            f"UPDATE model_market_prices SET {site}={_lit(price)}, {site}_status='{status}', "
            f"{site}_at=NOW(), {site}_title={_lit(title)}, {site}_url={_lit(url)}, "
            f"{site}_confirmed=FALSE, updated_at=NOW() "
            f"WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
        )
    else:
        cur.execute(
            f"UPDATE model_market_prices SET {site}_status='{status}', {site}_at=NOW(), "
            f"{site}_title={_lit(msg)}, updated_at=NOW() "
            f"WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
        )
    recalc(cur, b, m)
    return {'row': get_row(cur, b, m), 'status': status, 'message': msg}, None


def exclude(cur, body):
    """«Не тот товар»: запомнить карточку как неподходящую для модели и перепарсить."""
    site = body.get('site')
    brand, model = body.get('brand') or '', body.get('model') or ''
    if site not in SITES:
        return None, 'Неизвестный сайт'
    b, m = keys(brand, model)
    row = get_row(cur, b, m)
    if not row or row[site] is None:
        return None, 'Цены для исключения нет'
    cur.execute(
        f"INSERT INTO market_excluded (brand_key, model_key, site, url, title, price) VALUES "
        f"({_lit(b)}, {_lit(m)}, '{site}', {_lit(row[f'{site}_url'])}, {_lit(row[f'{site}_title'])}, "
        f"{_lit(row[site])})"
    )
    return fetch_price(cur, body)


def confirm(cur, body):
    site = body.get('site')
    if site not in SITES:
        return None, 'Неизвестный сайт'
    b, m = keys(body.get('brand') or '', body.get('model') or '')
    cur.execute(
        f"UPDATE model_market_prices SET {site}_confirmed=TRUE, {site}_suspect=FALSE, updated_at=NOW() "
        f"WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
    )
    recalc(cur, b, m)
    return {'row': get_row(cur, b, m)}, None


def filters_state(cur):
    cur.execute(
        "SELECT e.id, e.site, e.url, e.title, e.price, e.created_at, p.brand, p.model "
        "FROM market_excluded e LEFT JOIN model_market_prices p "
        "ON p.brand_key=e.brand_key AND p.model_key=e.model_key ORDER BY e.id DESC LIMIT 300"
    )
    return {'filters': F.load(cur), 'defaults': F.DEFAULTS, 'excluded': cur.fetchall()}, None


def filters_save(cur, body):
    err = F.save(cur, body.get('key'), body.get('value'))
    return (None, err) if err else filters_state(cur)


def filters_reset(cur, body):
    err = F.reset(cur, body.get('key'))
    return (None, err) if err else filters_state(cur)


def unexclude(cur, body):
    cur.execute(f"DELETE FROM market_excluded WHERE id={int(body.get('id') or 0)}")
    return filters_state(cur)


def set_total(cur, body):
    field = body.get('field')
    if field not in TOTALS:
        return None, 'Неизвестное поле'
    raw = str(body.get('value') if body.get('value') is not None else '').replace(' ', '').replace(',', '.')
    value = None
    if raw:
        try:
            value = round(float(raw), 2)
        except ValueError:
            return None, 'Введите число'
    b, m = ensure_row(cur, body.get('brand') or '', body.get('model') or '')
    cur.execute(
        f"UPDATE model_market_prices SET {field}={_lit(value)}, "
        f"{field}_manual={'TRUE' if value is not None else 'FALSE'}, updated_at=NOW() "
        f"WHERE brand_key={_lit(b)} AND model_key={_lit(m)}"
    )
    return {'row': get_row(cur, b, m)}, None


def lookup(cur, body):
    pairs = {keys(p.get('brand'), p.get('model')) for p in (body.get('models') or [])[:500]}
    pairs = [p for p in pairs if p[1]]
    rows = []
    if pairs:
        vals = ', '.join(f"({_lit(b)}, {_lit(m)})" for b, m in pairs)
        cur.execute(f"SELECT {COLS} FROM model_market_prices WHERE (brand_key, model_key) IN ({vals})")
        rows = cur.fetchall()
    return {'rows': rows, 'sites': enabled_sites(cur)}


def handler(event: dict, context) -> dict:
    """Цены маркетплейсов по модели (WB РФ/РБ, Ozon РФ/РБ, Яндекс Маркет, М.Видео): поиск минимальной цены, средняя по стране, ручной ввод, настройки прокси Proxy.Market и проверка каждого сайта, фильтры поиска (предлоги, запчасти, синонимы типов, правдоподобие цены), «Не тот товар» и подтверждение подозрительной цены."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}
    if method == 'GET':
        return _resp(200, {'status': 'ok', 'service': 'market-prices', 'sites': list(SITES)})

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    body = json.loads(event.get('body') or '{}')
    action = body.get('action', '')

    with psycopg2.connect(os.environ['DATABASE_URL']) as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        if action in ('vps_install', 'vps_file', 'vps_register'):
            ip = ((event.get('requestContext') or {}).get('identity') or {}).get('sourceIp')
            if action == 'vps_install':
                data, err = vps.public_install(cur, body)
            elif action == 'vps_file':
                data, err = vps.public_file(cur, body)
            else:
                data, err = vps.public_register(cur, body, ip)
            return _resp(403, {'error': err}) if err else _resp(200, data)

        actor = who(cur, token)
        if not actor:
            return _resp(401, {'error': 'Войдите заново'})
        perms = perms_of(cur, actor)
        owner = actor['is_owner']
        can_see = owner or perms.get('market_see') or perms.get('market_edit')
        can_edit = owner or perms.get('market_edit')
        if not can_see:
            return _resp(403, {'error': 'Нет доступа к ценам маркетплейсов'})

        if action == 'lookup':
            return _resp(200, {**lookup(cur, body), 'can_edit': bool(can_edit), 'is_owner': owner})
        if action in ('fetch', 'set_total', 'exclude', 'confirm') and not can_edit:
            return _resp(403, {'error': 'Нет права получать и править цены'})
        if action == 'fetch':
            data, err = fetch_price(cur, body)
            return _resp(400, {'error': err}) if err else _resp(200, data)
        if action in ('exclude', 'confirm'):
            data, err = (exclude if action == 'exclude' else confirm)(cur, body)
            return _resp(400, {'error': err}) if err else _resp(200, data)
        if action == 'set_total':
            data, err = set_total(cur, body)
            return _resp(400, {'error': err}) if err else _resp(200, data)

        handlers = {
            'settings': lambda: (settings(cur), None),
            'save_key': lambda: save_key(cur, body),
            'create_proxies': lambda: create_proxies(cur, body),
            'save_site': lambda: save_site(cur, body),
            'test_site': lambda: test_site(cur, body),
            'filters': lambda: filters_state(cur),
            'filters_save': lambda: filters_save(cur, body),
            'filters_reset': lambda: filters_reset(cur, body),
            'unexclude': lambda: unexclude(cur, body),
            'vps_state': lambda: vps.state(cur),
            'vps_ping': lambda: (vps.ping(cur), None),
            'vps_new_code': lambda: vps.new_code(cur),
            'vps_restart': lambda: vps.command(cur, '/restart'),
            'vps_clear': lambda: vps.command(cur, '/clear_cookies'),
            'vps_update': lambda: vps.command(cur, '/update'),
        }
        if action in handlers:
            if not owner:
                return _resp(403, {'error': 'Настройки доступны только владельцу'})
            data, err = handlers[action]()
            return _resp(400, {'error': err}) if err else _resp(200, data)

    return _resp(400, {'error': 'Неизвестное действие'})