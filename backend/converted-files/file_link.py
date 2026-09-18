import base64
import hashlib
import hmac
import time
import urllib.parse


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def _ascii_name(name: str) -> str:
    ext = ''
    if '.' in name:
        ext = '.' + name.rsplit('.', 1)[1]
    safe = ''.join(c for c in name if c.isascii() and (c.isalnum() or c in '-_.'))
    safe = safe.strip('.') or 'file'
    if ext and not safe.lower().endswith(ext.lower()):
        safe += ext
    return safe


def build_proxy_link(proxy_base: str, file_url: str, file_name: str, key: str, ttl: int = 3600) -> str:
    """Подписанная ссылка на файл через посредника — её Telegram сможет скачать."""
    exp = str(int(time.time()) + ttl)
    u = _b64(file_url.encode())
    sig = hmac.new(key.encode(), f'{u}.{exp}'.encode(), hashlib.sha256).hexdigest()
    real = file_name or 'file.xlsx'
    query = urllib.parse.urlencode({'u': u, 'e': exp, 's': sig, 'n': _b64(real.encode())})
    return f"{proxy_base.rstrip('/')}/file/{_ascii_name(real)}?{query}"