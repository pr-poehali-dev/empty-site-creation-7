import json
import os
import socket
import urllib.request
import urllib.error
from datetime import datetime, timedelta

DIRECT = 'https://api.telegram.org'
COOLDOWN_MIN = 10
TIMEOUT = 4
MAX_TRIES = 3


def _force_ipv4():
    orig = socket.getaddrinfo

    def ipv4_only(host, port, family=0, *args, **kwargs):
        return orig(host, port, socket.AF_INET, *args, **kwargs)
    socket.getaddrinfo = ipv4_only


_force_ipv4()


def _settings(cur):
    cur.execute("SELECT key, value FROM app_settings WHERE key LIKE 'tg_%'")
    return {r[0]: r[1] for r in cur.fetchall()}


def _routes(cur):
    """Список путей по порядку: с учётом режима и остывания упавших."""
    s = _settings(cur)
    mode = s.get('tg_mode', 'auto')
    raw = s.get('tg_proxies', '')
    proxies = [p.strip().rstrip('/') for p in raw.split(',') if p.strip()]

    if mode == 'direct':
        order = [DIRECT]
    elif mode == 'proxy':
        order = proxies
    else:
        order = [DIRECT] + proxies

    if not order:
        order = [DIRECT]

    cur.execute("SELECT route, ok, failed_at FROM tg_route_state")
    state = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    fresh, cooling = [], []
    for r in order:
        st = state.get(r)
        if st and not st[0] and st[1] and st[1] > datetime.now() - timedelta(minutes=COOLDOWN_MIN):
            cooling.append(r)
        else:
            fresh.append(r)
    return fresh + cooling, s


def _mark(cur, route, ok, error=None):
    safe_route = route.replace("'", "''")
    if ok:
        cur.execute(
            f"""INSERT INTO tg_route_state (route, ok, last_success_at, fail_count, last_error)
                VALUES ('{safe_route}', TRUE, NOW(), 0, NULL)
                ON CONFLICT (route) DO UPDATE SET ok = TRUE, last_success_at = NOW(),
                fail_count = 0, last_error = NULL, failed_at = NULL"""
        )
    else:
        safe_err = (error or '')[:200].replace("'", "''")
        cur.execute(
            f"""INSERT INTO tg_route_state (route, ok, failed_at, fail_count, last_error)
                VALUES ('{safe_route}', FALSE, NOW(), 1, '{safe_err}')
                ON CONFLICT (route) DO UPDATE SET ok = FALSE, failed_at = NOW(),
                fail_count = tg_route_state.fail_count + 1, last_error = '{safe_err}'"""
        )


NO_KEY_MSG = (
    'Ключ посредника не задан. Откройте Настройки → Telegram, нажмите '
    '«Сгенерировать ключ» и вставьте ту же строку в код посредника на Cloudflare.'
)


class NoProxyKey(Exception):
    pass


HUMAN = {
    'URLError': 'Не удалось связаться с Telegram — путь закрыт. Настройте посредника: Настройки → Telegram → Подключение посредников.',
    'timeout': 'Telegram не ответил вовремя. Если повторяется — настройте посредника: Настройки → Telegram.',
    'TimeoutError': 'Telegram не ответил вовремя. Если повторяется — настройте посредника: Настройки → Telegram.',
    'socket.timeout': 'Telegram не ответил вовремя. Если повторяется — настройте посредника: Настройки → Telegram.',
    'ConnectionResetError': 'Связь с Telegram оборвалась. Настройте посредника: Настройки → Telegram.',
    'HTTP 403': 'Посредник отклонил запрос — скорее всего ключ на площадке не совпадает с ключом в настройках.',
    'HTTP 404': 'Посредник не найден по этому адресу. Проверьте адрес в списке посредников.',
    'HTTP 500': 'Посредник ответил ошибкой. Проверьте, что код вставлен целиком.',
}


def humanize(err):
    if not err:
        return None
    return HUMAN.get(err, err)


def _call(route, token, method, payload, secret):
    if route != DIRECT and not secret:
        raise NoProxyKey(NO_KEY_MSG)
    url = f'{route}/bot{token}/{method}'
    data = json.dumps(payload).encode()
    headers = {'Content-Type': 'application/json'}
    if route != DIRECT:
        headers['X-Proxy-Key'] = secret
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode())


def tg_call(cur, method, payload, token=None):
    """Вызов Telegram API: перебирает пути, пока какой-нибудь не ответит.

    Возвращает (result, route) при успехе или (None, None) при полном отказе.
    """
    token = token or os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token:
        return None, None

    routes, s = _routes(cur)
    secret = (s.get('tg_proxy_key') or '').strip()
    last_err = None

    for route in routes[:MAX_TRIES]:
        try:
            result = _call(route, token, method, payload, secret)
            if result.get('ok'):
                _mark(cur, route, True)
                return result, route
            last_err = str(result.get('description', 'unknown'))
            _mark(cur, route, False, last_err)
        except NoProxyKey:
            last_err = NO_KEY_MSG
            _mark(cur, route, False, 'no_proxy_key')
        except urllib.error.HTTPError as e:
            last_err = f'HTTP {e.code}'
            _mark(cur, route, False, last_err)
        except Exception as e:
            last_err = type(e).__name__
            _mark(cur, route, False, last_err)

    return None, humanize(last_err)


def _probe_one(args):
    route, token, secret = args
    entry = {'route': route, 'direct': route == DIRECT}
    t0 = datetime.now()
    try:
        result = _call(route, token, 'getMe', {}, secret)
        entry['ok'] = bool(result.get('ok'))
        entry['bot'] = (result.get('result') or {}).get('username')
        if not entry['ok']:
            entry['error'] = str(result.get('description'))[:120]
    except NoProxyKey:
        entry['ok'] = False
        entry['error'] = NO_KEY_MSG
        entry['no_key'] = True
    except urllib.error.HTTPError as e:
        entry['ok'] = False
        entry['error'] = humanize(f'HTTP {e.code}')
    except Exception as e:
        entry['ok'] = False
        entry['error'] = humanize(type(e).__name__)
    entry['ms'] = int((datetime.now() - t0).total_seconds() * 1000)
    return entry


def tg_probe(cur, token=None):
    """Проверка связи: пробует все пути одновременно и возвращает отчёт."""
    from concurrent.futures import ThreadPoolExecutor

    token = token or os.environ.get('TELEGRAM_BOT_TOKEN', '')
    routes, s = _routes(cur)
    secret = (s.get('tg_proxy_key') or '').strip()

    if not routes:
        return {'mode': s.get('tg_mode', 'auto'), 'routes': []}

    with ThreadPoolExecutor(max_workers=min(len(routes), 8)) as ex:
        report = list(ex.map(_probe_one, [(r, token, secret) for r in routes]))

    return {
        'mode': s.get('tg_mode', 'auto'),
        'routes': report,
        'has_key': bool(secret),
    }