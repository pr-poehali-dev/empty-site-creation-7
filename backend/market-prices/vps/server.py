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

VERSION = '1.1.2'

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
    '(KHTML, like Gecko) Chrome/{v}.0.0.0 Safari/537.36'
)


def user_agent(b):
    major = (b.version or '130').split('.')[0]
    return UA.format(v=major)
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


xvfb = None


def start_xvfb():
    global xvfb
    import subprocess
    if xvfb and xvfb.poll() is None:
        return
    xvfb = subprocess.Popen(
        ['Xvfb', ':99', '-screen', '0', '1366x800x24', '-nolisten', 'tcp'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1)


async def get_browser():
    global pw, browser
    if browser and browser.is_connected():
        return browser
    if not pw:
        pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=False,
        args=[
            '--headless=new', '--disable-blink-features=AutomationControlled', '--no-sandbox',
            '--disable-dev-shm-usage', '--lang=ru-RU', '--window-size=1366,800',
        ],
        ignore_default_args=['--enable-automation'],
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
            user_agent=user_agent(b),
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


OZ_HOST = {'ru': 'https://www.ozon.ru', 'by': 'https://ozon.by'}
OZ_VIEW = {'width': 820, 'height': 760}
oz = {'browser': None, 'ctx': {}, 'page': {}}
oz_lock = asyncio.Lock()


def oz_cookie_file(country):
    return os.path.join(DATA, f'oz_cookies_{country}.json')


async def oz_browser():
    if oz['browser'] and oz['browser'].is_connected():
        return oz['browser']
    await get_browser()
    start_xvfb()
    oz['browser'] = await pw.firefox.launch(headless=False, env={**os.environ, 'DISPLAY': ':99'})
    oz['ctx'].clear()
    oz['page'].clear()
    return oz['browser']


async def oz_context(country, proxy):
    async with oz_lock:
        cur = oz['ctx'].get(country)
        if cur and cur[0] == proxy and oz['browser'] and oz['browser'].is_connected():
            return cur[1]
        if cur:
            await oz_close_ctx(country)
        b = await oz_browser()
        cf = oz_cookie_file(country)
        ctx = await b.new_context(
            proxy=split_proxy(proxy), locale='ru-RU',
            timezone_id='Europe/Minsk' if country == 'by' else 'Europe/Moscow',
            viewport=OZ_VIEW, storage_state=cf if os.path.exists(cf) else None,
        )
        oz['ctx'][country] = (proxy, ctx)
        return ctx


async def oz_save(country):
    cur = oz['ctx'].get(country)
    if cur:
        try:
            await cur[1].storage_state(path=oz_cookie_file(country))
        except Exception as e:
            print(f'oz save {country}: {e}')


async def oz_close_ctx(country):
    await oz_save(country)
    oz['page'].pop(country, None)
    cur = oz['ctx'].pop(country, None)
    if cur:
        try:
            await cur[1].close()
        except Exception:
            pass


async def oz_state(page):
    try:
        title = await page.title()
        text = await page.evaluate('document.body ? document.body.innerText.slice(0, 3000) : ""')
    except Exception:
        return 'loading'
    if 'Antibot' in title or re.search(r'не бот|пазл|ползун', text, re.IGNORECASE):
        return 'captcha'
    if re.search(r'нет соединения|доступ ограничен', title + text, re.IGNORECASE):
        return 'blocked'
    if not text.strip():
        return 'loading'
    return 'ok'


async def search_oz(page, host, query):
    path = '/search/?' + urllib.parse.urlencode({'text': query, 'sorting': 'price', 'from_global': 'true'})
    await page.goto(host + path, wait_until='domcontentloaded', timeout=20000)
    st = 'loading'
    for _ in range(12):
        st = await oz_state(page)
        if st != 'loading':
            break
        await page.wait_for_timeout(700)
    if st in ('captcha', 'blocked'):
        raise Captcha()
    api = '/api/entrypoint-api.bx/page/json/v2?url=' + urllib.parse.quote(path)
    res = await page.evaluate(
        "async (u) => { const r = await fetch(u, {credentials: 'include', headers: {Accept: 'application/json'}});"
        " return {status: r.status, text: await r.text()}; }",
        api,
    )
    try:
        data = json.loads(res['text'])
    except ValueError:
        raise Captcha()
    if res['status'] == 403 or 'challengeURL' in data or 'incidentId' in data:
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


async def run_oz(site, query, proxy):
    host, country = OZ[site]
    ctx = await oz_context(country, proxy)
    page = await ctx.new_page()
    try:
        cards = await search_oz(page, host, query)
    finally:
        await page.close()
    await oz_save(country)
    return cards


PUZZLE_JS = """() => {
  const fits = (r) => r.width >= 240 && r.height >= 200 && r.width < innerWidth * 0.98;
  const leaf = [...document.querySelectorAll('body *')].find(
    (e) => e.children.length === 0 && /Сопоставьте|пазл|ползун/i.test(e.textContent || ''));
  let e = leaf;
  while (e && e.parentElement) {
    const r = e.getBoundingClientRect();
    if (fits(r)) {
      let p = e;
      while (p.parentElement && fits(p.parentElement.getBoundingClientRect())) p = p.parentElement;
      const q = p.getBoundingClientRect();
      return {x: Math.max(0, q.x - 8), y: Math.max(0, q.y - 8), w: q.width + 16, h: q.height + 16};
    }
    e = e.parentElement;
  }
  return null;
}"""


async def oz_shot(country, crop=True, fixed=None):
    import base64
    page = oz['page'].get(country)
    if not page or page.is_closed():
        return {'open': False}
    state = await oz_state(page)
    box = fixed if isinstance(fixed, dict) and {'x', 'y', 'w', 'h'} <= set(fixed) else None
    if not box and crop and state == 'captcha':
        try:
            box = await page.evaluate(PUZZLE_JS)
        except Exception:
            box = None
    clip = box or {'x': 0, 'y': 0, 'w': OZ_VIEW['width'], 'h': OZ_VIEW['height']}
    clip = {
        'x': max(0, clip['x']), 'y': max(0, clip['y']),
        'w': min(clip['w'], OZ_VIEW['width'] - max(0, clip['x'])),
        'h': min(clip['h'], OZ_VIEW['height'] - max(0, clip['y'])),
    }
    img = await page.screenshot(
        type='jpeg', quality=70,
        clip={'x': clip['x'], 'y': clip['y'], 'width': clip['w'], 'height': clip['h']},
    )
    if state == 'ok':
        await oz_save(country)
    return {
        'open': True, 'state': state, 'crop': clip, 'cropped': bool(box), 'view': OZ_VIEW,
        'image': base64.b64encode(img).decode(), 'url': page.url[:200],
    }


async def h_oz_open(request):
    b = await request.json()
    country = b.get('country')
    if country not in OZ_HOST:
        return ok({'error': 'Неизвестная страна'}, 400)
    ctx = await oz_context(country, b.get('proxy'))
    page = oz['page'].get(country)
    if not page or page.is_closed():
        page = await ctx.new_page()
        oz['page'][country] = page
    q = urllib.parse.urlencode({'text': b.get('query') or 'Blackton TP536'})
    for attempt in range(2):
        try:
            await page.goto(f'{OZ_HOST[country]}/search/?{q}', wait_until='domcontentloaded', timeout=9000)
        except Exception as e:
            print(f'oz open {country}: {e}')
        await page.wait_for_timeout(2000)
        if await oz_state(page) != 'blocked':
            break
        await page.wait_for_timeout(800)
    return ok(await oz_shot(country, b.get('crop', True)))


async def h_oz_shot(request):
    b = await request.json()
    return ok(await oz_shot(b.get('country'), b.get('crop', True)))


async def h_oz_input(request):
    b = await request.json()
    country = b.get('country')
    page = oz['page'].get(country)
    if not page or page.is_closed():
        return ok({'open': False})
    phase = b.get('phase') or 'full'
    path = [p for p in (b.get('path') or [])[:600] if isinstance(p, list) and len(p) >= 3]
    m = page.mouse
    if path and phase in ('down', 'full'):
        await m.move(path[0][0], path[0][1])
        await m.down()
        path = path[1:]
    for x, y, dt in path:
        if dt > 0:
            await asyncio.sleep(min(dt, 300) / 1000)
        await m.move(x, y)
    if phase in ('up', 'full'):
        await asyncio.sleep(0.05)
        await m.up()
        await page.wait_for_timeout(int(b.get('wait') or 1800))
    return ok(await oz_shot(country, b.get('crop', True), b.get('clip')))


async def h_oz_close(request):
    b = await request.json()
    country = b.get('country')
    page = oz['page'].pop(country, None)
    state = 'closed'
    if page and not page.is_closed():
        state = await oz_state(page)
        await oz_save(country)
        await page.close()
    return ok({'state': state})


async def run_task(site, query, proxy):
    if site in OZ:
        return await run_oz(site, query, proxy)
    if site in WB:
        host, country = WB[site]
        fn = search_wb
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
        'oz_browser': bool(oz['browser'] and oz['browser'].is_connected()),
        'oz_pass': {c: int(os.path.getmtime(oz_cookie_file(c))) for c in OZ_HOST if os.path.exists(oz_cookie_file(c))},
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


async def h_debug(request):
    try:
        return await debug_inner(request)
    except Exception as e:
        return ok({'fatal': str(e)[:1000]})


async def debug_inner(request):
    b = await request.json()
    country = b.get('country') or 'ru'
    own = None
    engine = b.get('engine') or 'chromium'
    if b.get('headed') or engine != 'chromium':
        await get_browser()
        env = dict(os.environ)
        if b.get('headed'):
            start_xvfb()
            env['DISPLAY'] = ':99'
        if engine == 'firefox':
            own = await pw.firefox.launch(headless=not b.get('headed'), env=env)
        else:
            args = ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage',
                    '--lang=ru-RU', '--window-size=1366,800']
            if not b.get('headed'):
                args.insert(0, '--headless=new')
            own = await pw.chromium.launch(
                headless=False, executable_path=chrome_path() if engine == 'chrome' else None,
                args=args, ignore_default_args=['--enable-automation'], env=env,
            )
    if b.get('fresh') or own:
        br = own or await get_browser()
        ua = b.get('ua') or (None if engine == 'firefox' else user_agent(br))
        ctx = await br.new_context(
            proxy=split_proxy(b.get('proxy')), locale='ru-RU', timezone_id='Europe/Moscow',
            viewport={'width': 1366, 'height': 800}, user_agent=ua,
        )
        if b.get('stealth'):
            await ctx.add_init_script(STEALTH)
        if b.get('block'):
            await ctx.route('**/*', block_heavy)
    else:
        ctx = await get_context(country, b.get('proxy'))
    page = await ctx.new_page()
    seen = []

    def on_response(resp):
        t = resp.request.resource_type
        if t in ('document', 'xhr', 'fetch'):
            seen.append([resp.status, t, resp.url[:200]])

    page.on('response', on_response)
    err = ''
    try:
        await page.goto(b['url'], wait_until='domcontentloaded', timeout=20000)
        await page.wait_for_timeout(int(b.get('wait') or 8000))
    except Exception as e:
        err = str(e)[:300]
    try:
        title = await page.title()
        text = await page.evaluate('document.body ? document.body.innerText : ""')
        html = await page.content()
        url = page.url
    except Exception as e:
        title, text, html, url = '', '', '', str(e)[:200]
    cookies = [c['name'] for c in await ctx.cookies()]
    fp = {}
    try:
        fp = await page.evaluate(
            "() => { const c = document.createElement('canvas'); const g = c.getContext('webgl');"
            " const d = g && g.getExtension('WEBGL_debug_renderer_info');"
            " return {ua: navigator.userAgent, wd: navigator.webdriver, plugins: navigator.plugins.length,"
            " langs: navigator.languages, hw: navigator.hardwareConcurrency, mem: navigator.deviceMemory,"
            " gl: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : (g ? 'no-ext' : 'no-webgl'),"
            " chrome: typeof window.chrome, screen: [screen.width, screen.height]}; }"
        )
    except Exception as e:
        fp = {'err': str(e)[:200]}
    await page.close()
    if own:
        await ctx.close()
        await own.close()
    elif b.get('fresh'):
        await ctx.close()
    else:
        await save_cookies(country, ctx)
    return ok({
        'url': url, 'title': title, 'error': err, 'text': text[:1500], 'html': html[:int(b.get('html') or 0)],
        'responses': seen[-40:], 'cookies': cookies, 'fp': fp,
    })


EXTRA = os.path.join(BASE, 'extra')
extra_job = {'proc': None, 'log': os.path.join(DATA, 'extra.log')}

EXTRA_SCRIPT = r'''
set -x
mkdir -p "$EXTRA"
cd "$EXTRA"
if [ "$WHAT" = "firefox" ]; then
  "$PY" -m playwright install firefox
fi
if [ "$WHAT" = "chrome" ]; then
  rm -rf chrome && mkdir chrome
  curl -fsSL -o chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  dpkg-deb -x chrome.deb chrome
  rm -f chrome.deb
  ldd chrome/opt/google/chrome/chrome | grep "not found" || echo "all libs ok"
  chrome/opt/google/chrome/chrome --version
fi
echo EXTRA_DONE
'''


def chrome_path():
    p = os.path.join(EXTRA, 'chrome', 'opt', 'google', 'chrome', 'chrome')
    return p if os.path.exists(p) else None


async def h_extra(request):
    import subprocess
    import sys
    b = await request.json()
    job = extra_job
    running = job['proc'] is not None and job['proc'].poll() is None
    if b.get('what') in ('firefox', 'chrome') and not running:
        env = {**os.environ, 'EXTRA': EXTRA, 'WHAT': b['what'], 'PY': sys.executable}
        log = open(job['log'], 'w')
        job['proc'] = subprocess.Popen(['bash', '-c', EXTRA_SCRIPT], env=env, stdout=log, stderr=subprocess.STDOUT)
        running = True
    tail = ''
    if os.path.exists(job['log']):
        with open(job['log'], encoding='utf-8', errors='replace') as f:
            tail = f.read()[-3000:]
    return ok({'running': running, 'log': tail, 'chrome': chrome_path()})


async def h_diag(request):
    import shutil
    import subprocess
    out = {'xvfb': shutil.which('Xvfb'), 'display': os.environ.get('DISPLAY')}
    bp = os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '')
    out['browsers'] = sorted(os.listdir(bp)) if bp and os.path.isdir(bp) else []
    for name in ('google-chrome', 'chromium'):
        out[name] = shutil.which(name)
    try:
        out['mem'] = subprocess.run(['free', '-m'], capture_output=True, text=True, timeout=5).stdout
    except Exception as e:
        out['mem'] = str(e)
    return ok(out)


async def save_all_wb():
    for country, (_, ctx) in list(contexts.items()):
        await save_cookies(country, ctx)


async def close_oz():
    for country in list(oz['ctx']):
        await oz_close_ctx(country)
    if oz['browser']:
        try:
            await oz['browser'].close()
        except Exception:
            pass
    oz['browser'] = None


async def h_restart(request):
    global browser
    await close_oz()
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
    for country in list(oz['ctx']):
        await oz_save(country)
    await save_all_wb()
    asyncio.get_running_loop().call_later(1, os._exit, 0)
    return ok({'ok': True, 'old': VERSION, 'version': data.get('version')})


async def on_cleanup(app):
    await close_oz()
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
    app.router.add_post('/debug', h_debug)
    app.router.add_post('/diag', h_diag)
    app.router.add_post('/extra', h_extra)
    app.router.add_post('/oz/open', h_oz_open)
    app.router.add_post('/oz/shot', h_oz_shot)
    app.router.add_post('/oz/input', h_oz_input)
    app.router.add_post('/oz/close', h_oz_close)
    app.router.add_post('/clear_cookies', h_clear)
    app.router.add_post('/update', h_update)
    app.on_cleanup.append(on_cleanup)
    tls = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    tls.load_cert_chain(os.path.join(BASE, 'cert.pem'), os.path.join(BASE, 'key.pem'))
    web.run_app(app, host='0.0.0.0', port=PORT, ssl_context=tls, access_log=None)


if __name__ == '__main__':
    main()