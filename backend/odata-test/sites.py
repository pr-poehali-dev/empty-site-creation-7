import re
import html as htmlmod
import urllib.request
import urllib.parse

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ru-RU,ru'})
    with urllib.request.urlopen(req, timeout=12) as r:
        raw = r.read()
        final = r.geturl()
        ctype = r.headers.get('Content-Type') or ''
    enc = 'cp1251' if '1251' in ctype.lower() or b'windows-1251' in raw[:3000].lower() else 'utf-8'
    return raw.decode(enc, 'replace'), final


def _text(s):
    return re.sub(r'\s+', ' ', htmlmod.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def _num(s):
    s = (s or '').replace('&nbsp;', '')
    s = re.sub(r'[^\d,.]', '', s or '').replace(',', '.')
    try:
        return float(s) if s else None
    except ValueError:
        return None


def _wg_parse(page):
    code = re.search(r'Код товара:\s*</span>\s*([\w-]+)', page)
    price = old = None
    m = re.search(r'<div class="font-cost"[^>]*>\s*((?:\d|\s|&nbsp;|\xa0)+)\s*</div>', page)
    if m:
        price = _num(m.group(1))
    m = re.search(r'<span class="strike"[^>]*>\s*((?:\d|\s|&nbsp;|\xa0)+)\s*</span>', page)
    if m:
        old = _num(m.group(1))
    weight = None
    table = re.search(r'class="product-desc[^"]*"[^>]*>(.*?)</table>', page, re.S)
    if table:
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', table.group(1), re.S):
            tds = [_text(x) for x in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)]
            if len(tds) >= 2 and re.search(r'^вес\b', tds[0], re.I) and weight is None:
                weight = _num(tds[1].split()[0] if tds[1] else '')
    title = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
    return {
        'code': code.group(1) if code else '',
        'price': price, 'old_price': old, 'weight': weight,
        'title': _text(title.group(1)) if title else '',
    }


def weissgauff(article):
    url = 'https://www.weissgauff.ru/?search=' + urllib.parse.quote(article)
    page, final = _get(url)
    if '/goods_' not in final:
        return {'found': False}
    d = _wg_parse(page)
    if d['code'].strip().lower() != article.strip().lower():
        return {'found': False}
    d.update({'found': True, 'url': final.split('#')[0]})
    return d


SITES = {'weissgauff': weissgauff}


def site_lookup(site, article):
    article = str(article or '').strip()
    if site not in SITES:
        return {'ok': False, 'error': 'Сайт не поддерживается'}
    if not article:
        return {'ok': True, 'found': False, 'reason': 'нет артикула'}
    try:
        d = SITES[site](article)
    except Exception as e:
        return {'ok': False, 'error': f'Сайт не ответил: {e}'}
    d['ok'] = True
    return d
