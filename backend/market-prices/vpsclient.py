import hashlib
import http.client
import json
import ssl


class VPSError(Exception):
    pass


def call(host, port, key, fingerprint, path, payload=None, timeout=5):
    """Запрос к браузерному серверу по HTTPS с проверкой отпечатка его сертификата."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    conn = http.client.HTTPSConnection(host, port, context=ctx, timeout=timeout)
    try:
        conn.connect()
        der = conn.sock.getpeercert(binary_form=True)
        if hashlib.sha256(der).hexdigest() != (fingerprint or '').lower():
            raise VPSError('Сертификат сервера не совпадает — возможна подмена')
        body = json.dumps(payload or {}, ensure_ascii=False).encode()
        conn.request('POST', path, body=body, headers={'Content-Type': 'application/json', 'X-Key': key})
        r = conn.getresponse()
        raw = r.read()
        if r.status == 403:
            raise VPSError('Сервер не принял ключ')
        try:
            return json.loads(raw)
        except ValueError:
            raise VPSError(f'Сервер ответил непонятно (код {r.status})')
    except (OSError, http.client.HTTPException) as e:
        raise VPSError(f'Браузерный сервер не на связи: {e}')
    finally:
        conn.close()
