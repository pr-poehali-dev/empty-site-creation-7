import base64
import hashlib
import hmac
import time
import urllib.parse


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def build_proxy_link(proxy_base: str, file_url: str, file_name: str, key: str, ttl: int = 3600) -> str:
    """Подписанная ссылка на файл через посредника — её Telegram сможет скачать."""
    exp = str(int(time.time()) + ttl)
    u = _b64(file_url.encode())
    sig = hmac.new(key.encode(), f'{u}.{exp}'.encode(), hashlib.sha256).hexdigest()
    name = urllib.parse.quote(file_name or 'file.xlsx')
    query = urllib.parse.urlencode({'u': u, 'e': exp, 's': sig})
    return f"{proxy_base.rstrip('/')}/file/{name}?{query}"
