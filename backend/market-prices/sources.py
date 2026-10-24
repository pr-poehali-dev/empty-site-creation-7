import re
import urllib.parse

import requests

UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/129.0 Safari/537.36'
)
TIMEOUT = 3

SITES = {
    'wb_ru': 'Wildberries РФ',
    'mv_ru': 'М.Видео',
    'wb_by': 'Wildberries РБ',
}


class Blocked(Exception):
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


def _is_own(title, pat):
    """Модель есть в названии, товар новый и это не аксессуар для этой модели."""
    t = title or ''
    return bool(pat.search(t)) and not BAD_WORDS.search(t) and not ACCESSORY.search(t)


def pick_min(cards, model):
    """cards: [(title, price)]. Минимальная цена среди карточек с точной моделью."""
    for pat in patterns_for(model):
        ok = [(t, p) for t, p in cards if p and p > 0 and _is_own(t, pat)]
        if ok:
            return min(ok, key=lambda x: x[1])
    return None


def _wb(query, curr, dest, lang):
    url = (
        f'https://search.wb.ru/exactmatch/{lang}/common/v13/search?appType=1&curr={curr}'
        f'&dest={dest}&lang=ru&page=1&query={urllib.parse.quote(query)}'
        f'&resultset=catalog&sort=priceup&spp=30'
    )
    r = requests.get(url, headers={'User-Agent': UA, 'Accept': '*/*'}, timeout=TIMEOUT)
    if r.status_code in (403, 429, 498):
        raise Blocked(f'Wildberries не пускает сервер (код {r.status_code})')
    r.raise_for_status()
    data = r.json()
    products = (data.get('data') or {}).get('products') or data.get('products') or []
    cards = []
    for p in products:
        title = f"{p.get('brand', '')} {p.get('name', '')}"
        price = None
        for s in p.get('sizes') or []:
            pr = (s.get('price') or {}).get('product')
            if pr:
                price = pr / 100
                break
        if price is None and p.get('salePriceU'):
            price = p['salePriceU'] / 100
        cards.append((title, price))
    return cards


MV_HEADERS = {
    'User-Agent': UA,
    'Referer': 'https://www.mvideo.ru/',
    'Cookie': (
        'MVID_CITY_ID=CityCZ_975; MVID_REGION_ID=1; MVID_REGION_SHOP=S002; '
        'MVID_TIMEZONE_OFFSET=3; MVID_KLADR_ID=7700000000000'
    ),
}


def _mv(query):
    s = requests.Session()
    s.headers.update(MV_HEADERS)
    r = s.get(
        'https://www.mvideo.ru/bff/products/v2/search',
        params={'query': query, 'offset': 0, 'limit': 24},
        timeout=TIMEOUT,
    )
    if r.status_code in (401, 403, 429):
        raise Blocked(f'М.Видео не пускает сервер (код {r.status_code})')
    r.raise_for_status()
    ids = ((r.json().get('body') or {}).get('products') or [])[:24]
    if not ids:
        return []
    r = s.post(
        'https://www.mvideo.ru/bff/product-details/list',
        json={'productIds': ids, 'mediaTypes': ['images'], 'category': True, 'status': True,
              'brand': True, 'propertyTypes': ['KEY'],
              'propertiesConfig': {'propertiesPortionSize': 5}, 'multioffer': False},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    names = {}
    for p in (r.json().get('body') or {}).get('products') or []:
        names[str(p.get('productId'))] = f"{p.get('name', '')} {p.get('modelName') or ''}"
    r = s.get(
        'https://www.mvideo.ru/bff/products/prices',
        params={'productIds': ','.join(ids), 'addBonusRubles': 'true', 'isPromoApplied': 'true'},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    cards = []
    for m in (r.json().get('body') or {}).get('materialPrices') or []:
        pid = str(m.get('productId'))
        price = (m.get('price') or {}).get('salePrice')
        if pid in names and price:
            cards.append((names[pid], float(price)))
    return cards


def search(site, brand, model):
    """Возвращает (цена, найденное название) или None, если точной модели нет."""
    m = clean_model(brand, model)
    query = f'{brand} {m}'.strip()
    if site == 'wb_ru':
        cards = _wb(query, 'rub', '-1257786', 'ru')
    elif site == 'wb_by':
        cards = _wb(query, 'byn', '-59202', 'by')
    elif site == 'mv_ru':
        cards = _mv(query)
    else:
        raise ValueError('Неизвестный сайт')
    return pick_min(cards, m)