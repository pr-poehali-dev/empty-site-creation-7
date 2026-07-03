import json
import os
import hmac
import hashlib
import time
import base64
import uuid
from urllib.parse import parse_qsl
from datetime import datetime, timezone
import psycopg2
import boto3


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def verify_init_data(init_data: str, bot_token: str, max_age: int = 86400):
    """Проверяет подпись Telegram WebApp initData. Возвращает (ok, user_dict, error)."""
    if not init_data:
        return False, None, 'Нет данных Telegram'
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        return False, None, 'Некорректные данные'
    received_hash = pairs.pop('hash', None)
    if not received_hash:
        return False, None, 'Нет подписи'
    data_check_string = '\n'.join(f'{k}={pairs[k]}' for k in sorted(pairs.keys()))
    secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc_hash, received_hash):
        return False, None, 'Подпись недействительна'
    auth_date = pairs.get('auth_date')
    if auth_date and auth_date.isdigit():
        if time.time() - int(auth_date) > max_age:
            return False, None, 'Данные устарели'
    user_raw = pairs.get('user')
    if not user_raw:
        return False, None, 'Нет пользователя'
    try:
        user = json.loads(user_raw)
    except Exception:
        return False, None, 'Некорректный пользователь'
    return True, user, None


def resolve_manager(cur, telegram_id):
    """Возвращает (manager_id, auction_role) сотрудника с доступом к аукциону или (None, None)."""
    cur.execute(
        """SELECT id, auction_role, status
           FROM managers
           WHERE telegram_chat_id = %s
           LIMIT 1""",
        (telegram_id,)
    )
    row = cur.fetchone()
    if not row:
        return None, None
    manager_id, auction_role, status = row
    if status != 'authorized' or auction_role not in ('operator', 'admin'):
        return None, None
    return manager_id, auction_role


def upload_photos(photos):
    """Загружает список base64-фото в S3, возвращает список CDN-ссылок."""
    if not photos:
        return []
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    urls = []
    for photo in photos[:5]:
        raw = photo
        content_type = 'image/jpeg'
        ext = 'jpg'
        if isinstance(photo, str) and photo.startswith('data:'):
            head, raw = photo.split(',', 1)
            if 'image/png' in head:
                content_type, ext = 'image/png', 'png'
            elif 'image/webp' in head:
                content_type, ext = 'image/webp', 'webp'
        data = base64.b64decode(raw)
        key = f"auction/{uuid.uuid4().hex}.{ext}"
        s3.put_object(Bucket='files', Key=key, Body=data, ContentType=content_type)
        urls.append(f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}")
    return urls


def handler(event: dict, context) -> dict:
    """Создание и получение аукционных лотов сотрудником через Telegram мини-приложение"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    method = event.get('httpMethod', 'GET')

    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Бот не настроен'})}

    body = json.loads(event.get('body') or '{}')
    init_data = body.get('init_data', '')
    if not init_data:
        params = event.get('queryStringParameters') or {}
        init_data = params.get('init_data', '')

    ok, user, err = verify_init_data(init_data, bot_token)
    if not ok:
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}

    telegram_id = user.get('id')
    conn = get_db()
    cur = conn.cursor()

    manager_id, auction_role = resolve_manager(cur, telegram_id)
    if not manager_id:
        cur.close()
        conn.close()
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет доступа к созданию лотов'})}

    if method == 'GET':
        cur.execute(
            """SELECT id, title, desired_price, quantity, quantity_left, status, ends_at, photo_urls, created_at
               FROM auction_lots
               WHERE created_by = %s
               ORDER BY created_at DESC
               LIMIT 100""",
            (manager_id,)
        )
        lots = []
        for r in cur.fetchall():
            lots.append({
                'id': r[0],
                'title': r[1],
                'desired_price': float(r[2]) if r[2] is not None else 0,
                'quantity': r[3],
                'quantity_left': r[4],
                'status': r[5],
                'ends_at': r[6].isoformat() if r[6] else None,
                'photo_urls': r[7] or [],
                'created_at': r[8].isoformat() if r[8] else None,
            })
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'lots': lots})}

    if method == 'POST':
        action = body.get('action', 'create')
        if action != 'create':
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Неизвестное действие'})}

        title = (body.get('title') or '').strip()
        description = (body.get('description') or '').strip() or None
        desired_price = body.get('desired_price')
        quantity = body.get('quantity') or 1
        ends_at_raw = body.get('ends_at')
        payment_deadline = body.get('payment_deadline_minutes') or 60
        photos = body.get('photos') or []

        errors = []
        if not title:
            errors.append('Укажите название лота')
        try:
            desired_price = float(desired_price)
            if desired_price <= 0:
                errors.append('Цена должна быть больше нуля')
        except (TypeError, ValueError):
            errors.append('Некорректная цена')
        try:
            quantity = int(quantity)
            if quantity < 1:
                errors.append('Количество должно быть не меньше 1')
        except (TypeError, ValueError):
            errors.append('Некорректное количество')
        ends_at = None
        if not ends_at_raw:
            errors.append('Укажите срок окончания')
        else:
            try:
                ends_at = datetime.fromisoformat(str(ends_at_raw).replace('Z', '+00:00'))
                if ends_at.tzinfo is None:
                    ends_at = ends_at.replace(tzinfo=timezone.utc)
                if ends_at <= datetime.now(timezone.utc):
                    errors.append('Срок окончания должен быть в будущем')
            except ValueError:
                errors.append('Некорректный срок окончания')

        if errors:
            cur.close()
            conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': '; '.join(errors)})}

        photo_urls = upload_photos(photos)

        cur.execute(
            """INSERT INTO auction_lots
               (created_by, title, description, desired_price, quantity, quantity_left,
                ends_at, payment_deadline_minutes, photo_urls, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
               RETURNING id""",
            (manager_id, title, description, desired_price, quantity, quantity,
             ends_at, payment_deadline, photo_urls)
        )
        lot_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'id': lot_id, 'photo_urls': photo_urls})}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}
