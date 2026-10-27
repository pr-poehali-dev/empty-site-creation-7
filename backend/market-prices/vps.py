import hashlib
import hmac
import json
import os
import re
import secrets

from vpsclient import VPSError, call

HERE = os.path.dirname(os.path.abspath(__file__))
FUNC_URL = 'https://functions.poehali.dev/07b7a61f-8174-437a-8dfe-fa779828a911'


def _esc(s):
    return str(s).replace("'", "''")


def _lit(v):
    return 'NULL' if v is None else f"'{_esc(v)}'"


def _read(name):
    with open(os.path.join(HERE, 'vps', name), encoding='utf-8') as f:
        return f.read()


def _install_script():
    ns = {}
    exec(_read('install_script.py'), ns)
    return ns['SCRIPT']


def server_version():
    m = re.search(r"^VERSION = '([^']+)'", _read('server.py'), re.M)
    return m.group(1) if m else ''


def row(cur):
    cur.execute("INSERT INTO market_vps (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
    cur.execute("SELECT * FROM market_vps WHERE id=1")
    return cur.fetchone()


def _code_ok(r, code):
    if not code or not r['install_code_hash'] or not r['install_code_expires']:
        return False
    h = hashlib.sha256(code.encode()).hexdigest()
    return hmac.compare_digest(h, r['install_code_hash'])


def _code_alive(cur, r, code):
    if not _code_ok(r, code):
        return False
    cur.execute("SELECT install_code_expires > NOW() AS alive FROM market_vps WHERE id=1")
    return cur.fetchone()['alive']


def _key_ok(r, key):
    return bool(key and r['api_key'] and hmac.compare_digest(key, r['api_key']))


def install_command(code):
    payload = json.dumps({'action': 'vps_install', 'code': code})
    return (
        f"rm -f /root/pricebot-install.pid; curl -fsS -X POST {FUNC_URL} -H 'Content-Type: application/json' -d '{payload}' "
        f"| python3 -c \"import sys,json;d=json.load(sys.stdin);sys.stdout.write(d['content'])\" "
        f"> /root/pricebot-install.sh && (setsid nohup bash /root/pricebot-install.sh "
        f"> /root/pricebot-install.log 2>&1 < /dev/null &) && sleep 2 && "
        f"tail -n +1 --pid=$(cat /root/pricebot-install.pid) -f /root/pricebot-install.log"
    )


WATCH_COMMAND = 'tail -n +1 -f /root/pricebot-install.log'


def new_code(cur):
    code = secrets.token_urlsafe(18)
    h = hashlib.sha256(code.encode()).hexdigest()
    row(cur)
    cur.execute(
        f"UPDATE market_vps SET install_code_hash='{h}', install_code_expires=NOW() + INTERVAL '1 day', "
        f"updated_at=NOW() WHERE id=1"
    )
    return {**_public_state(row(cur)), 'command': install_command(code), 'expires_hours': 24}, None


# ---------- запросы от самого VPS (без входа на сайт) ----------

def public_install(cur, body):
    r = row(cur)
    code = str(body.get('code') or '')
    if not _code_alive(cur, r, code):
        return None, 'Код установки неверный или устарел — скопируйте новую команду в настройках'
    script = _install_script().replace('__FUNC__', FUNC_URL).replace('__CODE__', code)
    return {'content': script}, None


def public_file(cur, body):
    r = row(cur)
    if not (_key_ok(r, body.get('key')) or _code_alive(cur, r, str(body.get('code') or ''))):
        return None, 'Нет доступа'
    return {'content': _read('server.py'), 'version': server_version()}, None


def public_register(cur, body, ip):
    r = row(cur)
    code = str(body.get('code') or '')
    if not _code_alive(cur, r, code):
        return None, 'Код установки неверный или устарел'
    key = str(body.get('key') or '')
    fp = str(body.get('fingerprint') or '').lower()
    try:
        port = int(body.get('port') or 8443)
    except (TypeError, ValueError):
        return None, 'Неверный порт'
    if not re.fullmatch(r'[0-9a-f]{64}', key) or not re.fullmatch(r'[0-9a-f]{64}', fp) or not ip:
        return None, 'Неполные данные сервера'
    try:
        info = call(ip, port, key, fp, '/ping', timeout=8)
    except VPSError as e:
        return None, f'Сайт не смог достучаться до сервера {ip}:{port} — {e}'
    cur.execute(
        f"UPDATE market_vps SET host={_lit(ip)}, port={port}, api_key={_lit(key)}, fingerprint={_lit(fp)}, "
        f"version={_lit(info.get('version'))}, install_code_hash=NULL, install_code_expires=NULL, "
        f"registered_at=NOW(), last_ok_at=NOW(), last_status='ok', last_message=NULL, "
        f"last_info={_lit(json.dumps(info, ensure_ascii=False))}, updated_at=NOW() WHERE id=1"
    )
    return {'ok': True}, None


# ---------- действия владельца ----------

def _public_state(r):
    info = {}
    try:
        info = json.loads(r['last_info'] or '{}')
    except ValueError:
        pass
    return {
        'registered': bool(r['host']),
        'host': r['host'], 'port': r['port'],
        'version': r['version'], 'latest_version': server_version(),
        'registered_at': r['registered_at'], 'last_ok_at': r['last_ok_at'],
        'last_status': r['last_status'], 'last_message': r['last_message'],
        'info': info,
    }


def _send(cur, path, payload=None, timeout=8):
    r = row(cur)
    if not r['host']:
        raise VPSError('Браузерный сервер ещё не установлен')
    return call(r['host'], r['port'], r['api_key'], r['fingerprint'], path, payload, timeout)


def ping(cur):
    try:
        info = _send(cur, '/ping')
    except VPSError as e:
        cur.execute(
            f"UPDATE market_vps SET last_status='offline', last_message={_lit(str(e))}, updated_at=NOW() WHERE id=1"
        )
        return _public_state(row(cur))
    cur.execute(
        f"UPDATE market_vps SET last_status='ok', last_message=NULL, last_ok_at=NOW(), "
        f"version={_lit(info.get('version'))}, last_info={_lit(json.dumps(info, ensure_ascii=False))}, "
        f"updated_at=NOW() WHERE id=1"
    )
    return _public_state(row(cur))


def state(cur):
    return _public_state(row(cur)), None


def command(cur, path):
    try:
        res = _send(cur, path, timeout=15)
    except VPSError as e:
        return None, str(e)
    if res.get('error'):
        return None, res['error']
    if path == '/update':
        return {**_public_state(row(cur)), 'result': res}, None
    return {**ping(cur), 'result': res}, None


def search(cur, site, query, proxy, timeout=28):
    """Поиск через браузер. Возвращает (status, cards, message)."""
    try:
        res = _send(cur, '/search', {'site': site, 'query': query, 'proxy': proxy}, timeout=timeout)
    except VPSError as e:
        return 'vps_offline', [], str(e)
    st = res.get('status')
    if st == 'ok':
        return 'ok', [(c[0], c[1]) for c in res.get('cards') or []], ''
    messages = {
        'captcha': 'Сайт показал капчу даже браузеру',
        'queue_full': 'Очередь браузерного сервера переполнена — повторите позже',
        'timeout': 'Браузер не дождался ответа сайта',
        'proxy_error': 'Прокси не отвечает',
    }
    return st or 'error', [], messages.get(st) or res.get('message') or 'Ошибка браузерного сервера'