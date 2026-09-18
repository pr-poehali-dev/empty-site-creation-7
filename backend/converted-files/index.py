"""Конвертированные файлы: список, загрузка и удаление"""
import json
import os
import base64
import psycopg2
import boto3
from tg_transport import tg_call

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
    'Access-Control-Max-Age': '86400',
}


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def get_s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def json_resp(status, body):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def esc(value):
    return str(value).replace("'", "''")


def send_document(cur, chat_id, file_name, data, caption):
    import urllib.request
    import urllib.error
    from tg_transport import _routes, DIRECT

    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token:
        return False, 'Бот не настроен'

    routes, settings = _routes(cur)
    secret = (settings.get('tg_proxy_key') or '').strip()
    boundary = '----poehali' + os.urandom(8).hex()
    crlf = b'\r\n'

    parts = []
    for key, val in (('chat_id', str(chat_id)), ('caption', caption[:1000])):
        parts.append(('--' + boundary).encode() + crlf)
        parts.append(f'Content-Disposition: form-data; name="{key}"'.encode() + crlf + crlf)
        parts.append(val.encode() + crlf)

    parts.append(('--' + boundary).encode() + crlf)
    parts.append(
        f'Content-Disposition: form-data; name="document"; filename="{file_name}"'.encode()
        + crlf
    )
    parts.append(b'Content-Type: application/octet-stream' + crlf + crlf)
    parts.append(data + crlf)
    parts.append(('--' + boundary + '--').encode() + crlf)
    payload = b''.join(parts)

    last_err = None
    for route in routes[:3]:
        if route != DIRECT and not secret:
            continue
        headers = {'Content-Type': f'multipart/form-data; boundary={boundary}'}
        if route != DIRECT:
            headers['X-Proxy-Key'] = secret
        req = urllib.request.Request(
            f'{route}/bot{token}/sendDocument', data=payload, headers=headers, method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                result = json.loads(resp.read().decode('utf-8', 'replace'))
            if result.get('ok'):
                return True, None
            last_err = str(result.get('description'))[:150]
        except urllib.error.HTTPError as e:
            last_err = f'HTTP {e.code}'
        except Exception as e:
            last_err = type(e).__name__

    return False, last_err


def get_user_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.phone, u.role FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,)
    )
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    """Список, загрузка и удаление конвертированных файлов. Только для владельца"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    req_headers = event.get('headers') or {}
    auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()

    user = get_user_by_token(cur, token)
    if not user:
        cur.close(); conn.close()
        return json_resp(401, {'error': 'Не авторизован'})

    if user[2] != 'owner':
        cur.close(); conn.close()
        return json_resp(403, {'error': 'Доступ только для владельца'})

    if method == 'GET':
        cur.execute(
            """SELECT id, title, description, file_url, file_name, size_bytes, created_at
               FROM converted_files ORDER BY created_at DESC"""
        )
        files = [
            {
                'id': r[0], 'title': r[1], 'description': r[2],
                'file_url': r[3], 'file_name': r[4],
                'size_bytes': r[5], 'created_at': r[6],
            }
            for r in cur.fetchall()
        ]
        cur.close(); conn.close()
        return json_resp(200, {'files': files})

    if method == 'POST' and (event.get('queryStringParameters') or {}).get('action') != 'telegram':
        body = json.loads(event.get('body') or '{}')
        title = (body.get('title') or '').strip()
        file_name = (body.get('file_name') or '').strip()
        content_b64 = body.get('file') or ''
        if not title or not file_name or not content_b64:
            cur.close(); conn.close()
            return json_resp(400, {'error': 'Нужны название, имя файла и содержимое'})

        data = base64.b64decode(content_b64)
        key = f"converted/{context.request_id}_{file_name}"
        get_s3().put_object(
            Bucket='files', Key=key, Body=data,
            ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

        cur.execute(
            f"""INSERT INTO converted_files (title, description, file_url, file_name, s3_key, size_bytes)
                VALUES ('{esc(title)}', '{esc(body.get('description') or '')}',
                        '{esc(url)}', '{esc(file_name)}', '{esc(key)}', {len(data)})
                RETURNING id"""
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close(); conn.close()
        return json_resp(200, {'id': new_id, 'file_url': url})

    if method == 'POST' and (event.get('queryStringParameters') or {}).get('action') == 'telegram':
        body = json.loads(event.get('body') or '{}')
        file_id = body.get('id')
        content_b64 = body.get('file') or ''
        if not file_id or not content_b64:
            cur.close(); conn.close()
            return json_resp(400, {'error': 'Нужен файл'})

        cur.execute(f"SELECT title, file_name FROM converted_files WHERE id = {int(file_id)}")
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return json_resp(404, {'error': 'Файл не найден'})

        cur.execute(f"SELECT telegram_chat_id FROM users WHERE id = {int(user[0])}")
        chat = cur.fetchone()
        if not chat or not chat[0]:
            cur.close(); conn.close()
            return json_resp(400, {'error': 'Telegram не привязан. Откройте бота и нажмите Старт'})

        data = base64.b64decode(content_b64)
        ok, err = send_document(cur, chat[0], row[1], data, row[0])
        conn.commit()
        cur.close(); conn.close()
        if ok:
            return json_resp(200, {'success': True})
        return json_resp(500, {'error': err or 'Не удалось отправить'})

    if method == 'PUT':
        params = event.get('queryStringParameters') or {}
        file_id = params.get('id')
        if not file_id:
            cur.close(); conn.close()
            return json_resp(400, {'error': 'Не указан id файла'})

        body = json.loads(event.get('body') or '{}')
        cur.execute(f"SELECT title, file_name FROM converted_files WHERE id = {int(file_id)}")
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return json_resp(404, {'error': 'Файл не найден'})

        old_title, old_name = row
        title = (body.get('title') or '').strip() or old_title
        file_name = (body.get('file_name') or '').strip() or old_name

        old_ext = os.path.splitext(old_name)[1]
        if old_ext and not file_name.lower().endswith(old_ext.lower()):
            file_name = os.path.splitext(file_name)[0] + old_ext

        cur.execute(
            f"""UPDATE converted_files
                SET title = '{esc(title)}', file_name = '{esc(file_name)}'
                WHERE id = {int(file_id)}"""
        )
        conn.commit()
        cur.close(); conn.close()
        return json_resp(200, {'title': title, 'file_name': file_name})

    if method == 'DELETE':
        params = event.get('queryStringParameters') or {}
        file_id = params.get('id')
        if not file_id:
            cur.close(); conn.close()
            return json_resp(400, {'error': 'Не указан id файла'})

        cur.execute(f"SELECT s3_key FROM converted_files WHERE id = {int(file_id)}")
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return json_resp(404, {'error': 'Файл не найден'})

        try:
            get_s3().delete_object(Bucket='files', Key=row[0])
        except Exception:
            pass

        cur.execute(f"DELETE FROM converted_files WHERE id = {int(file_id)}")
        conn.commit()
        cur.close(); conn.close()
        return json_resp(200, {'success': True})

    cur.close(); conn.close()
    return json_resp(405, {'error': 'Метод не поддерживается'})