import json
import re
import urllib.parse

import requests

UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/129.0 Safari/537.36'
)
TIMEOUT = 8

SITES = {
    'wb_ru': {'title': 'Wildberries РФ', 'country': 'ru', 'cur': '₽'},
    'oz_ru': {'title': 'Ozon РФ', 'country': 'ru', 'cur': '₽'},
    'ym_ru': {'title': 'Яндекс Маркет', 'country': 'ru', 'cur': '₽'},
    'mv_ru': {'title': 'М.Видео', 'country': 'ru', 'cur': '₽'},
    'wb_by': {'title': 'Wildberries РБ', 'country': 'by', 'cur': 'BYN'},
    'oz_by': {'title': 'Ozon РБ', 'country': 'by', 'cur': 'BYN'},
}


class Blocked(Exception):
    pass


class NoTraffic(Exception):
    pass


def clean_model(brand, model):
    """Убирает бренд из начала модели: «Haier HVC550» у Haier → «HVC550»."""
    m = (model or '').strip()
    b = (brand or '').strip()
    if b and m.lower().startswith(b.lower() + ' '):
        m = m[len(b):].strip()
    return m


def _token_re(token):
    runs = re.findall(r'[A-Za-zА-Яа-яЁё]+|\d+', token)
    return r'[\s\-]?'.join(re.escape(r) for r in runs)


def model_pattern(model):
    """Модель должна встретиться целиком: TP536 не совпадёт с TP5360 или TP536G."""
    tokens = [t for t in re.split(r'[\s\-_/.,()+]+', model) if t]
    if not tokens:
        return None
    body = r'[\s\-_/.]*'.join(_token_re(t) for t in tokens)
    tail = r'\+' if model.strip().endswith('+') else ''
    return re.compile(
        r'(?<![A-Za-zА-Яа-яЁё0-9])' + body + tail + r'(?![A-Za-z0-9])', re.IGNORECASE
    )


def patterns_for(model):
    """Полная модель, а если в ней есть «хвост» без цифр — ещё и её ядро с цифрами."""
    out = []
    full = model_pattern(model)
    if full:
        out.append(full)
    tokens = [t for t in re.split(r'\s+', model) if t]
    core = [t for t in tokens if re.search(r'\d', t)]
    if len(tokens) > 1 and core and core != tokens:
        core_str = ' '.join(core)
        if len(re.sub(r'[^A-Za-z0-9]', '', core_str)) >= 5:
            p = model_pattern(core_str)
            if p:
                out.append(p)
    return out


BAD_WORDS = re.compile(
    r'уцен|восстановлен|б/у|бывш|refurb|витрин|некондиц|повреждени', re.IGNORECASE
)
ACCESSORY = re.compile(
    r'^\W*(фильтр|щ[её]тк|мешк|мешок|насадк|аккумулятор|батаре|чехол|запчаст|комплект|набор|'
    r'салфетк|тряпк|картридж|шланг|крышк|колб|ролик|валик|ремен|зарядн|адаптер|держател|'
    r'кабел|пульт|сменн|контейнер|резервуар|моп|губк|уплотнител|прокладк|пленк|плёнк|стекло)',
    re.IGNORECASE,
)


USED_MARK = re.compile(
    r'уцен[её]н|уценк|б/у|бывш[а-я]* в употреб|ресейл|resale|восстановлен|'
    r'отличное состояние|хорошее состояние|удовлетворительное состояние|витринн',
    re.IGNORECASE,
)


def _is_own(title, pat):
    """Модель есть в названии, товар новый и это не аксессуар для этой модели."""
    t = title or ''
    return bool(pat.search(t)) and not BAD_WORDS.search(t) and not ACCESSORY.search(t)


def _card(c):
    return (c[0] or '', c[1], c[2] if len(c) > 2 else None, bool(c[3]) if len(c) > 3 else False)


def pick_min(cards, model, rules=None, skip=None):
    """cards: [(title, price, ref?, used?)]. Минимальная цена среди карточек с точной моделью.
    rules — фильтры из настроек (предлоги, запчасти, типы, правдоподобие); skip(ref, title) —
    карточки, отмеченные «Не тот товар». Возвращает (title, price, ref) или None."""
    items = [_card(c) for c in cards]
    for pat in patterns_for(model):
        ok = []
        for title, price, ref, used in items:
            if not price or price <= 0 or used:
                continue
            m = pat.search(title)
            if not m or BAD_WORDS.search(title):
                continue
            before = title[:m.start()]
            if rules is None:
                if ACCESSORY.search(title):
                    continue
            elif rules.is_part(title) or rules.prep_before(before):
                continue
            if skip and skip(ref, title):
                continue
            typed = rules.own_type(before) if rules else None
            ok.append((title, price, ref, typed))
        if not ok:
            continue
        pool = [c for c in ok if c[3]] or ok
        pool.sort(key=lambda x: x[1])
        plaus = rules.plaus if rules else None
        if plaus and plaus.get('site_on'):
            ratio = float(plaus.get('site_ratio') or 2)
            while len(pool) >= 2 and pool[0][1] * ratio < pool[1][1]:
                pool.pop(0)
        return pool[0][0], pool[0][1], pool[0][2]
    return None


def product_url(site, ref):
    """Прямая ссылка на карточку товара по его номеру на сайте."""
    if not ref:
        return None
    r = str(ref).strip()
    if not r:
        return None
    if site == 'wb_ru':
        return f'https://www.wildberries.ru/catalog/{r}/detail.aspx'
    if site == 'wb_by':
        return f'https://www.wildberries.by/catalog/{r}/detail.aspx'
    if site == 'oz_ru':
        return f'https://www.ozon.ru/product/{r}/'
    if site == 'oz_by':
        return f'https://ozon.by/product/{r}/'
    if site == 'mv_ru':
        return f'https://www.mvideo.ru/products/{r}'
    if site == 'ym_ru':
        return r if r.startswith('http') else None
    return None


def _session(proxy):
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9'})
    if proxy:
        s.proxies = {'http': proxy, 'https': proxy}
    return s


def _get(s, url, site, **kw):
    try:
        r = s.get(url, timeout=TIMEOUT, **kw)
    except requests.exceptions.ProxyError as e:
        text = str(e)
        print(f'proxy error {site}: {text[-200:]}')
        code = re.search(r'Tunnel connection failed: (\d{3}[^\'")]*)', text)
        detail = code.group(1).strip() if code else 'нет соединения'
        if code and code.group(1)[:3] in ('402', '407'):
            raise NoTraffic(f'Прокси не пускает: {detail}')
        raise Blocked(f'Прокси не отвечает: {detail}')
    if r.status_code in (402, 407):
        raise NoTraffic('Прокси не пускает: кончился трафик или неверный доступ')
    if r.status_code in (403, 429, 498):
        print(f'blocked {site} {r.status_code}')
        raise Blocked(f'Сайт не пустил (код {r.status_code})')
    r.raise_for_status()
    return r


def _price_num(text):
    t = re.sub(r'[^\d,.]', '', (text or '').replace('\u2009', '').replace('\xa0', ''))
    t = t.replace(',', '.')
    try:
        return float(t) if t else None
    except ValueError:
        return None


def _wb(s, query, curr, dest):
    url = (
        f'https://search.wb.ru/exactmatch/ru/common/v13/search?appType=1&curr={curr}'
        f'&dest={dest}&lang=ru&page=1&query={urllib.parse.quote(query)}'
        f'&resultset=catalog&sort=priceup&spp=30'
    )
    data = _get(s, url, 'wb', headers={'Accept': '*/*'}).json()
    products = (data.get('data') or {}).get('products') or data.get('products') or []
    cards = []
    for p in products:
        title = f"{p.get('brand', '')} {p.get('name', '')}"
        price = None
        for sz in p.get('sizes') or []:
            pr = (sz.get('price') or {}).get('product')
            if pr:
                price = pr / 100
                break
        if price is None and p.get('salePriceU'):
            price = p['salePriceU'] / 100
        cards.append((title, price, p.get('id')))
    return cards


MV_COOKIE = (
    'MVID_CITY_ID=CityCZ_975; MVID_REGION_ID=1; MVID_REGION_SHOP=S002; '
    'MVID_TIMEZONE_OFFSET=3; MVID_KLADR_ID=7700000000000'
)


def _mv(s, query):
    h = {'Referer': 'https://www.mvideo.ru/', 'Cookie': MV_COOKIE}
    r = _get(s, 'https://www.mvideo.ru/bff/products/v2/search', 'mv', headers=h,
             params={'query': query, 'offset': 0, 'limit': 24})
    ids = ((r.json().get('body') or {}).get('products') or [])[:24]
    if not ids:
        return []
    r = s.post(
        'https://www.mvideo.ru/bff/product-details/list', headers=h, timeout=TIMEOUT,
        json={'productIds': ids, 'mediaTypes': ['images'], 'category': True, 'status': True,
              'brand': True, 'propertyTypes': ['KEY'],
              'propertiesConfig': {'propertiesPortionSize': 5}, 'multioffer': False},
    )
    r.raise_for_status()
    names, used = {}, set()
    for p in (r.json().get('body') or {}).get('products') or []:
        pid = str(p.get('productId'))
        names[pid] = f"{p.get('name', '')} {p.get('modelName') or ''}"
        if USED_MARK.search(json.dumps(p.get('status') or p.get('labels') or '', ensure_ascii=False)):
            used.add(pid)
    r = _get(s, 'https://www.mvideo.ru/bff/products/prices', 'mv', headers=h,
             params={'productIds': ','.join(ids), 'addBonusRubles': 'true', 'isPromoApplied': 'true'})
    cards = []
    for m in (r.json().get('body') or {}).get('materialPrices') or []:
        pid = str(m.get('productId'))
        price = (m.get('price') or {}).get('salePrice')
        if pid in names and price:
            cards.append((names[pid], float(price), pid))
    return cards


def _ym_link(item, p):
    for src in (p, item or {}):
        pid = src.get('productId') or src.get('modelId')
        sku = src.get('skuId') or src.get('marketSku') or src.get('sku')
        if pid:
            tail = f'?sku={sku}' if sku else ''
            return f'https://market.yandex.ru/product/{pid}{tail}'
    return None


def _ym(s, query):
    r = _get(s, 'https://market.yandex.ru/search', 'ym',
             params={'text': query, 'how': 'aprice'}, headers={'Accept': 'text/html'})
    html = r.text
    if 'showcaptcha' in r.url or ('captcha' in html[:5000].lower() and 'AddToCartButton' not in html):
        raise Blocked('Яндекс Маркет показал капчу')
    cards = []
    for blob in re.findall(r'<noframes data-apiary="patch">(.*?)</noframes>', html, re.S):
        if 'AddToCartButton' not in blob:
            continue
        try:
            d = json.loads(blob)
        except ValueError:
            continue
        for item in (d.get('widgets', {}).get('@light/AddToCartButton') or {}).values():
            p = (item or {}).get('pendingCartItem') or {}
            price = _price_num(((p.get('price') or {}).get('valueFmt')) or '')
            if p.get('name') and price:
                used = bool(USED_MARK.search(json.dumps(item, ensure_ascii=False)))
                cards.append((p['name'], price, _ym_link(item, p), used))
    return cards


def _walk_ozon(node, out):
    if isinstance(node, dict):
        if 'mainState' in node and isinstance(node['mainState'], list):
            texts, price = [], None
            for atom in node['mainState']:
                a = json.dumps(atom, ensure_ascii=False)
                if price is None and 'price' in a.lower():
                    for m in re.finditer(r'"text":\s*"([^"]*\d[^"]*(?:₽|BYN|р\.|руб)[^"]*)"', a):
                        price = _price_num(m.group(1))
                        if price:
                            break
                for m in re.finditer(r'"text":\s*"([^"]{8,})"', a):
                    texts.append(m.group(1))
            title = max(texts, key=len) if texts else ''
            used = bool(USED_MARK.search(json.dumps(node['mainState'], ensure_ascii=False)))
            out.append((title, price, node.get('sku'), used))
        for v in node.values():
            _walk_ozon(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk_ozon(v, out)


def _ozon(s, host, query):
    path = '/search/?' + urllib.parse.urlencode({'text': query, 'sorting': 'price', 'from_global': 'true'})
    url = f'https://{host}/api/entrypoint-api.bx/page/json/v2?url={urllib.parse.quote(path)}'
    try:
        r = _get(s, url, 'ozon', headers={'Accept': 'application/json'})
    except Blocked:
        raise Blocked('Ozon показал проверку «я не робот»')
    try:
        data = r.json()
    except ValueError:
        raise Blocked('Ozon показал проверку «я не робот»')
    if 'challengeURL' in data or 'incidentId' in data:
        raise Blocked('Ozon показал проверку «я не робот»')
    cards = []
    for key, val in (data.get('widgetStates') or {}).items():
        if 'searchResults' not in key:
            continue
        try:
            _walk_ozon(json.loads(val), cards)
        except ValueError:
            continue
    return cards


def search(site, brand, model, proxy=None, rules=None, skip=None):
    """Возвращает (найденное название, цена) или None, если точной модели нет."""
    m = clean_model(brand, model)
    query = f'{brand} {m}'.strip()
    s = _session(proxy)
    if site == 'wb_ru':
        cards = _wb(s, query, 'rub', '-1257786')
    elif site == 'wb_by':
        cards = _wb(s, query, 'byn', '-59202')
    elif site == 'mv_ru':
        cards = _mv(s, query)
    elif site == 'ym_ru':
        cards = _ym(s, query)
    elif site == 'oz_ru':
        cards = _ozon(s, 'www.ozon.ru', query)
    elif site == 'oz_by':
        cards = _ozon(s, 'ozon.by', query)
    else:
        raise ValueError('Неизвестный сайт')
    return pick_min(cards, m, rules, skip)