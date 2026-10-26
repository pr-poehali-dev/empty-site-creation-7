import asyncio
import hmac
import json
import os
import re
import ssl
import time
import urllib.parse
import urllib.request

from aiohttp import web
from playwright.async_api import async_playwright

VERSION = '1.0.0'

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'data')
KEY = os.environ['VPS_KEY']
PORT = int(os.environ.get('VPS_PORT', '8443'))
FUNC = os.environ['SITE_FUNC']

MAX_PARALLEL = 3
MAX_QUEUE = 20
TASK_TIMEOUT = 25

UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
)
BLOCK = {'image', 'media', 'font'}
STEALTH = (
    "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
    "Object.defineProperty(navigator,'languages',{get:()=>['ru-RU','ru']});"
)

WB = {'wb_ru': ('https://www.wildberries.ru', 'ru'), 'wb_by': ('https://www.wildberries.by', 'by')}
OZ = {'oz_ru': ('https://www.ozon.ru', 'ru'), 'oz_by': ('https://ozon.by', 'by')}

OZ_CHALLENGE = re.compile(r'antibot|challenge|доступ ограничен|не робот', re.IGNORECASE)
WB_CAPTCHA = re.compile(r'captcha|не робот|подозрительн', re.IGNORECASE)
WB_EMPTY = re.compile(r'ничего не нашлось|ничего не найдено|не нашли', re.IGNORECASE)

stats = {'started': time.time(), 'done': 0, 'failed': 0, 'waiting': 0, 'running': 0}
pw = None
browser = None
contexts = {}
ctx_lock = asyncio.Lock()
sem = asyncio.Semaphore(MAX_PARALLEL)


class Captcha(Exception):
    pass


def split_proxy(url):
    if not url:
        return None
    u = urllib.parse.urlsplit(url)
    p = {'server': f'{u.scheme or "http"}://{u.hostname}:{u.port}'}
    if u.username:
        p['username'] = urllib.parse.unquote(u.username)
        p['password'] = urllib.parse.unquote(u.password or '')
    return p


def cookie_file(country):
    return os.path.join(DATA, f'cookies_{country}.json')


async def get_browser():
    global pw, browser
    if browser and browser.is_connected():
        return browser
    if not pw:
        pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=True,
        args=['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
    )
    contexts.clear()
    return browser


async def block_heavy(route):
    if route.request.resource_type in BLOCK:
        await route.abort()
    else:
        await route.continue_()


async def save_cookies(country, ctx):
    try:
        await ctx.storage_state(path=cookie_file(country))
    except Exception as e:
        print(f'save cookies {country}: {e}')


async def close_contexts(save=True):
    for country, (_, ctx) in list(contexts.items()):
        if save:
            await save_cookies(country, ctx)
        try:
            await ctx.close()
        except Exception:
            pass
    contexts.clear()


async def get_context(country, proxy):
    async with ctx_lock:
        cur = contexts.get(country)
        if cur and cur[0] == proxy and browser and browser.is_connected():
            return cur[1]
        if cur:
            await save_cookies(country, cur[1])
            try:
                await cur[1].close()
            except Exception:
                pass
        b = await get_browser()
        cf = cookie_file(country)
        ctx = await b.new_context(
            proxy=split_proxy(proxy),
            user_agent=UA,
            locale='ru-RU',
            timezone_id='Europe/Minsk' if country == 'by' else 'Europe/Moscow',
            viewport={'width': 1366, 'height': 800},
            storage_state=cf if os.path.exists(cf) else None,
        )
        await ctx.add_init_script(STEALTH)
        await ctx.route('**/*', block_heavy)
        contexts[country] = (proxy, ctx)
        return ctx


def wb_cards(data):
    products = (data.get('data') or {}).get('products') or data.get('products') or []
    cards = []
    for p in products:
        title = f"{p.get('brand', '')} {p.get('name', '')}".strip()
        price = None
        for sz in p.get('sizes') or []:
            pr = (sz.get('price') or {}).get('product')
            if pr:
                price = pr / 100
                break
        if price is None and p.get('salePriceU'):
            price = p['salePriceU'] / 100
        cards.append([title, price, p.get('id')])
    return cards


async def search_wb(page, host, query):
    got = asyncio.get_running_loop().create_future()

    async def on_response(resp):
        u = resp.url
        if got.done() or 'search' not in u or 'filters' in u:
            return
        if 'resultset=catalog' not in u and 'exactmatch' not in u:
            return
        try:
            data = await resp.json()
        except Exception:
            return
        if not got.done() and isinstance(data, dict):
            got.set_result(data)

    page.on('response', on_response)
    url = f'{host}/catalog/0/search.aspx?search={urllib.parse.quote(query)}&sort=priceup'
    await page.goto(url, wait_until='domcontentloaded', timeout=20000)
    try:
        data = await asyncio.wait_for(got, 15)
    except asyncio.TimeoutError:
        text = await page.content()
        if WB_EMPTY.search(text):
            return []
        if WB_CAPTCHA.search(text):
            raise Captcha()
        raise
    return wb_cards(data)


def price_num(text):
    t = re.sub(r'[^\d,.]', '', (text or '').replace('\u2009', '').replace('\xa0', '')).replace(',', '.')
    try:
        return float(t) if t else None
    except ValueError:
        return None


def walk_ozon(node, out):
    if isinstance(node, dict):
        if isinstance(node.get('mainState'), list):
            texts, price = [], None
            for atom in node['mainState']:
                a = json.dumps(atom, ensure_ascii=False)
                if price is None and 'price' in a.lower():
                    for m in re.finditer(r'"text":\s*"([^"]*\d[^"]*(?:₽|BYN|р\.|руб)[^"]*)"', a):
                        price = price_num(m.group(1))
                        if price:
                            break
                for m in re.finditer(r'"text":\s*"([^"]{8,})"', a):
                    texts.append(m.group(1))
            out.append([max(texts, key=len) if texts else '', price, None])
        for v in node.values():
            walk_ozon(v, out)
    elif isinstance(node, list):
        for v in node:
            walk_ozon(v, out)


async def search_oz(page, host, query):
    path = '/search/?' + urllib.parse.urlencode({'text': query, 'sorting': 'price', 'from_global': 'true'})
    await page.goto(host + path, wait_until='domcontentloaded', timeout=20000)
    for _ in range(15):
        head = (await page.title()) + (await page.content())[:4000]
        if not OZ_CHALLENGE.search(head):
            break
        await page.wait_for_timeout(1000)
    else:
        raise Captcha()
    api = '/api/entrypoint-api.bx/page/json/v2?url=' + urllib.parse.quote(path)
    res = await page.evaluate(
        "async (u) => { const r = await fetch(u, {credentials: 'include', headers: {Accept: 'application/json'}});"
        " return {status: r.status, text: await r.text()}; }",
        api,
    )
    if res['status'] == 403:
        raise Captcha()
    try:
        data = json.loads(res['text'])
    except ValueError:
        raise Captcha()
    if 'challengeURL' in data or 'incidentId' in data:
        raise Captcha()
    cards = []
    for key, val in (data.get('widgetStates') or {}).items():
        if 'searchResults' not in key:
            continue
        try:
            walk_ozon(json.loads(val), cards)
        except ValueError:
            continue
    return cards


async def run_task(site, query, proxy):
    if site in WB:
        host, country = WB[site]
        fn = search_wb
    elif site in OZ:
        host, country = OZ[site]
        fn = search_oz
    else:
        raise ValueError('Неизвестный сайт')
    ctx = await get_context(country, proxy)
    page = await ctx.new_page()
    try:
        cards = await fn(page, host, query)
    finally:
        await page.close()
    await save_cookies(country, ctx)
    return cards


def ok(data, status=200):
    return web.json_response(data, status=status, dumps=lambda d: json.dumps(d, ensure_ascii=False))


@web.middleware
async def auth(request, handler):
    if not hmac.compare_digest(request.headers.get('X-Key', ''), KEY):
        return ok({'error': 'forbidden'}, 403)
    return await handler(request)


async def h_ping(request):
    return ok({
        'ok': True, 'version': VERSION, 'uptime': int(time.time() - stats['started']),
        'done': stats['done'], 'failed': stats['failed'],
        'running': stats['running'], 'waiting': stats['waiting'],
        'browser': bool(browser and browser.is_connected()),
    })


async def h_search(request):
    b = await request.json()
    site, query, proxy = b.get('site'), (b.get('query') or '').strip(), b.get('proxy')
    if site not in WB and site not in OZ or not query:
        return ok({'status': 'error', 'message': 'Нужны сайт и запрос'}, 400)
    if stats['waiting'] >= MAX_QUEUE:
        return ok({'status': 'queue_full'})
    stats['waiting'] += 1
    queued = True
    try:
        async with sem:
            stats['waiting'] -= 1
            queued = False
            stats['running'] += 1
            started = time.time()
            try:
                cards = await asyncio.wait_for(run_task(site, query, proxy), TASK_TIMEOUT)
                stats['done'] += 1
                return ok({'status': 'ok', 'cards': cards, 'ms': int((time.time() - started) * 1000)})
            except Captcha:
                stats['failed'] += 1
                return ok({'status': 'captcha'})
            except asyncio.TimeoutError:
                stats['failed'] += 1
                return ok({'status': 'timeout'})
            except Exception as e:
                stats['failed'] += 1
                msg = str(e)
                print(f'{site} {query}: {msg[:500]}')
                if 'ERR_PROXY' in msg or 'ERR_TUNNEL' in msg:
                    return ok({'status': 'proxy_error', 'message': msg[:300]})
                return ok({'status': 'error', 'message': msg[:300]})
            finally:
                stats['running'] -= 1
    finally:
        if queued:
            stats['waiting'] -= 1


async def h_restart(request):
    global browser
    async with ctx_lock:
        await close_contexts()
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
        browser = None
    return ok({'ok': True})


async def h_clear(request):
    async with ctx_lock:
        await close_contexts(save=False)
        for country in ('ru', 'by'):
            try:
                os.remove(cookie_file(country))
            except FileNotFoundError:
                pass
    return ok({'ok': True})


def download_update():
    body = json.dumps({'action': 'vps_file', 'key': KEY}).encode()
    req = urllib.request.Request(FUNC, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


async def h_update(request):
    data = await asyncio.to_thread(download_update)
    code = data.get('content') or ''
    if not code:
        return ok({'ok': False, 'error': data.get('error') or 'Сайт не отдал файл'}, 502)
    compile(code, 'server.py', 'exec')
    target = os.path.join(BASE, 'server.py')
    with open(target + '.new', 'w', encoding='utf-8') as f:
        f.write(code)
    os.replace(target + '.new', target)
    asyncio.get_running_loop().call_later(1, os._exit, 0)
    return ok({'ok': True, 'old': VERSION, 'version': data.get('version')})


async def on_cleanup(app):
    await close_contexts()
    if browser:
        await browser.close()
    if pw:
        await pw.stop()


def main():
    os.makedirs(DATA, exist_ok=True)
    app = web.Application(middlewares=[auth], client_max_size=1024 * 1024)
    app.router.add_route('*', '/ping', h_ping)
    app.router.add_post('/search', h_search)
    app.router.add_post('/restart', h_restart)
    app.router.add_post('/clear_cookies', h_clear)
    app.router.add_post('/update', h_update)
    app.on_cleanup.append(on_cleanup)
    tls = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    tls.load_cert_chain(os.path.join(BASE, 'cert.pem'), os.path.join(BASE, 'key.pem'))
    web.run_app(app, host='0.0.0.0', port=PORT, ssl_context=tls, access_log=None)


if __name__ == '__main__':
    main()
