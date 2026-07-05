import json
import os
import hmac
import hashlib
import time
import base64
import uuid
import urllib.request
import urllib.error
from urllib.parse import parse_qsl
from datetime import datetime, timezone
import psycopg2
import boto3


TMA_BASE_URL = os.environ.get('TMA_BASE_URL', 'https://t.me')


def tg_api(bot_token, method, payload):
    """Вызов Telegram Bot API. Возвращает (ok, result_or_error)."""
    url = f'https://api.telegram.org/bot{bot_token}/{method}'
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode())
        if res.get('ok'):
            return True, res.get('result')
        return False, res.get('description', 'Ошибка Telegram')
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode())
            return False, err.get('description', f'HTTP {e.code}')
        except Exception:
            return False, f'HTTP {e.code}'
    except Exception as e:
        return False, str(e)


def esc(text):
    if text is None:
        return ''
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build_caption(lot):
    """lot: dict с title, description, desired_price, quantity_left, ends_at(datetime)."""
    lines = ["🔥 <b>!АУКЦИОН!</b> 🔥", "", f"<b>{esc(lot['title'])}</b>"]
    if lot.get('description'):
        lines.append(esc(lot['description']))
    lines.append('')
    lines.append(f"Цена: <b>{int(lot['desired_price'])} ₽</b>")
    lines.append(f"Осталось: {lot['quantity_left']} шт.")
    if lot.get('ends_at'):
        lines.append(f"До: {lot['ends_at'].strftime('%d.%m.%Y %H:%M')}")
    return '\n'.join(lines)


def lot_keyboard(bot_username, lot_id):
    if bot_username:
        url = f"https://t.me/{bot_username}?startapp=lot_{lot_id}"
    else:
        url = f"https://t.me"
    return {'inline_keyboard': [[{'text': 'Участвовать', 'url': url}]]}


def mark_posts(cur, bot_token, lot_id, note):
    """Редактирует посты лота: добавляет пометку и убирает кнопку. note — текст статуса."""
    cur.execute(
        """SELECT p.channel_id, p.message_id, c.chat_id
           FROM auction_lot_channels p
           JOIN auction_channels c ON c.id = p.channel_id
           WHERE p.lot_id = %s AND p.status = 'published'""",
        (lot_id,)
    )
    posts = cur.fetchall()
    for _, message_id, chat_id in posts:
        if not message_id:
            continue
        tg_api(bot_token, 'editMessageCaption', {
            'chat_id': chat_id, 'message_id': message_id,
            'caption': f"<b>{esc(note)}</b>", 'parse_mode': 'HTML',
        })
    cur.execute(
        "UPDATE auction_lot_channels SET status = 'closed' WHERE lot_id = %s AND status = 'published'",
        (lot_id,)
    )


def finalize_lot_inline(cur, bot_token, lot_id):
    """Досрочное подведение итогов лота: отбор победителей, уведомления, смена статуса."""
    from datetime import timedelta
    cur.execute(
        "SELECT title, quantity, payment_deadline_minutes FROM auction_lots WHERE id = %s",
        (lot_id,)
    )
    lr = cur.fetchone()
    title, quantity, deadline_min = lr[0], lr[1], (lr[2] or 60)

    cur.execute(
        """SELECT telegram_id, username, display_name, price
           FROM auction_bids WHERE lot_id = %s
           ORDER BY price DESC, created_at ASC""",
        (lot_id,)
    )
    bids = cur.fetchall()

    if not bids:
        cur.execute(
            "UPDATE auction_lots SET status = 'unsold', finalized_at = now() WHERE id = %s",
            (lot_id,)
        )
        mark_posts(cur, bot_token, lot_id, 'Аукцион завершён — лот не сыгран')
        return 'unsold'

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    deadline = now_naive + timedelta(minutes=deadline_min)
    winners_count = min(quantity, len(bids))
    bot_uname = os.environ.get('TELEGRAM_BOT_USERNAME', '').strip().lstrip('@')
    if not bot_uname:
        _, me = tg_api(bot_token, 'getMe', {})
        bot_uname = me.get('username') if isinstance(me, dict) else None
    lot_url = f"https://t.me/{bot_uname}?startapp=lot_{lot_id}" if bot_uname else "https://t.me"

    for idx, (tg_id, uname, dname, price) in enumerate(bids):
        position = idx + 1
        is_winner = position <= winners_count
        delivered = False
        if is_winner:
            text = (
                f"🏆 <b>Вы выиграли лот!</b>\n\n<b>{esc(title)}</b>\n"
                f"Ваша цена: <b>{int(price)} ₽</b>\n"
                f"Выкупите до: <b>{deadline.strftime('%d.%m.%Y %H:%M')}</b>"
            )
            delivered, _ = tg_api(bot_token, 'sendMessage', {
                'chat_id': tg_id, 'text': text, 'parse_mode': 'HTML',
                'reply_markup': {'inline_keyboard': [[{'text': 'Открыть лот', 'url': lot_url}]]},
            })
        cur.execute(
            """INSERT INTO auction_winners
                 (lot_id, telegram_id, username, display_name, price, position, win_type, status, pay_deadline, notified)
               VALUES (%s, %s, %s, %s, %s, %s, 'auction', %s, %s, %s)
               ON CONFLICT (lot_id, telegram_id) DO UPDATE SET
                 price = EXCLUDED.price, position = EXCLUDED.position,
                 status = EXCLUDED.status, pay_deadline = EXCLUDED.pay_deadline,
                 notified = auction_winners.notified OR EXCLUDED.notified""",
            (lot_id, tg_id, uname, dname, price, position,
             'awaiting_payment' if is_winner else 'reserve',
             deadline if is_winner else None, delivered)
        )

    cur.execute(
        "UPDATE auction_lots SET status = 'payment', finalized_at = now() WHERE id = %s",
        (lot_id,)
    )
    mark_posts(cur, bot_token, lot_id, 'Аукцион завершён — подводим итоги')
    return 'payment'


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


def s3_client():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def upload_photos(photos):
    """Загружает base64-фото в S3, готовые CDN-ссылки пропускает. Возвращает список ссылок."""
    if not photos:
        return []
    s3 = None
    urls = []
    for photo in photos[:5]:
        if isinstance(photo, str) and photo.startswith('http'):
            urls.append(photo)
            continue
        raw = photo
        content_type = 'image/jpeg'
        ext = 'jpg'
        if isinstance(photo, str) and photo.startswith('data:'):
            head, raw = photo.split(',', 1)
            if 'image/png' in head:
                content_type, ext = 'image/png', 'png'
            elif 'image/webp' in head:
                content_type, ext = 'image/webp', 'webp'
        if s3 is None:
            s3 = s3_client()
        data = base64.b64decode(raw)
        key = f"auction/{uuid.uuid4().hex}.{ext}"
        s3.put_object(Bucket='files', Key=key, Body=data, ContentType=content_type)
        urls.append(f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}")
    return urls


def delete_photos(urls):
    """Удаляет фото лота из S3 по CDN-ссылкам."""
    if not urls:
        return
    s3 = s3_client()
    prefix = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/"
    for url in urls:
        if isinstance(url, str) and url.startswith(prefix):
            key = url[len(prefix):]
            try:
                s3.delete_object(Bucket='files', Key=key)
            except Exception:
                pass


def can_manage(cur, lot_id, manager_id, auction_role):
    """Возвращает (row, error). Право: создатель лота или admin."""
    cur.execute(
        """SELECT id, created_by, status, photo_urls
           FROM auction_lots WHERE id = %s LIMIT 1""",
        (lot_id,)
    )
    row = cur.fetchone()
    if not row:
        return None, 'Лот не найден'
    if row[1] != manager_id and auction_role != 'admin':
        return None, 'Нет прав на этот лот'
    return row, None


def parse_ends_at(raw):
    dt = datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


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
        params = event.get('queryStringParameters') or {}
        lot_id_raw = params.get('lot_id') or body.get('lot_id')

        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

        def effective_status(status, ends_at):
            """Единый статус для всех экранов: время вышло, но крон не подвёл итоги → 'ended'."""
            if status == 'active' and ends_at is not None and ends_at <= now_naive:
                return 'ended'
            return status

        def serialize(r):
            eff = effective_status(r[5], r[6])
            return {
                'id': r[0],
                'title': r[1],
                'description': r[9] if len(r) > 9 else None,
                'desired_price': float(r[2]) if r[2] is not None else 0,
                'quantity': r[3],
                'quantity_left': r[4],
                'status': eff,
                'raw_status': r[5],
                'ends_at': r[6].isoformat() if r[6] else None,
                'photo_urls': r[7] or [],
                'created_at': r[8].isoformat() if r[8] else None,
                'payment_deadline_minutes': r[10] if len(r) > 10 else None,
                'created_by': r[11] if len(r) > 11 else None,
                'published_count': r[12] if len(r) > 12 else 0,
            }

        if lot_id_raw:
            cur.execute(
                """SELECT id, title, desired_price, quantity, quantity_left, status, ends_at,
                          photo_urls, created_at, description, payment_deadline_minutes, created_by
                   FROM auction_lots WHERE id = %s LIMIT 1""",
                (int(lot_id_raw),)
            )
            r = cur.fetchone()
            if not r:
                cur.close(); conn.close()
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Лот не найден'})}
            if r[11] != manager_id and auction_role != 'admin':
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Нет прав на этот лот'})}
            lot = serialize(r)
            lot['auction_role'] = auction_role
            lot['can_finalize'] = auction_role == 'admin' and lot['status'] in ('active', 'ended')

            # ставки: количество всегда; топ-цены — только админу
            cur.execute("SELECT COUNT(*) FROM auction_bids WHERE lot_id = %s", (r[0],))
            lot['bids_count'] = cur.fetchone()[0]
            if auction_role == 'admin':
                cur.execute(
                    "SELECT price FROM auction_bids WHERE lot_id = %s ORDER BY price DESC, created_at ASC LIMIT %s",
                    (r[0], r[3])
                )
                lot['top_bids'] = [float(x[0]) for x in cur.fetchall()]

            # победители (итоги), если лот подведён
            cur.execute(
                """SELECT display_name, username, price, position, status, pay_deadline, notified, telegram_id
                   FROM auction_winners WHERE lot_id = %s ORDER BY position ASC""",
                (r[0],)
            )
            winners = []
            for w in cur.fetchall():
                item = {
                    'display_name': w[0], 'username': w[1],
                    'position': w[3], 'status': w[4],
                    'pay_deadline': w[5].isoformat() if w[5] else None,
                    'notified': w[6],
                    'telegram_id': w[7],
                }
                if auction_role == 'admin':
                    item['price'] = float(w[2])
                winners.append(item)
            lot['winners'] = winners

            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'lot': lot})}

        group = params.get('group', 'active')
        if group == 'finished':
            status_cond = "l.status IN ('payment', 'finished')"
        elif group == 'unsold':
            status_cond = "l.status = 'unsold'"
        else:  # active: активные (в т.ч. с истёкшим временем, ещё не подведённые) и отменённые
            status_cond = "l.status IN ('active', 'cancelled')"

        cur.execute(
            f"""SELECT l.id, l.title, l.desired_price, l.quantity, l.quantity_left, l.status, l.ends_at,
                      l.photo_urls, l.created_at, l.description, l.payment_deadline_minutes, l.created_by,
                      (SELECT COUNT(*) FROM auction_lot_channels p
                       WHERE p.lot_id = l.id AND p.status = 'published')
               FROM auction_lots l
               WHERE l.created_by = %s AND {status_cond}
               ORDER BY
                 (l.status = 'cancelled') ASC,
                 l.cancelled_at DESC NULLS LAST,
                 l.created_at DESC
               LIMIT 100""",
            (manager_id,)
        )
        lots = [serialize(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'lots': lots})}

    if method == 'POST':
        action = body.get('action', 'create')

        if action == 'publish':
            row, err = can_manage(cur, body.get('lot_id'), manager_id, auction_role)
            if err:
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}
            if row[2] != 'active':
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Публиковать можно только активный лот'})}

            channel_ids = body.get('channel_ids') or []
            if not channel_ids:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Выберите каналы'})}

            cur.execute(
                """SELECT id, title, description, desired_price, quantity_left, ends_at, photo_urls
                   FROM auction_lots WHERE id = %s""",
                (row[0],)
            )
            lr = cur.fetchone()
            lot = {
                'id': lr[0], 'title': lr[1], 'description': lr[2],
                'desired_price': float(lr[3]), 'quantity_left': lr[4],
                'ends_at': lr[5], 'photo_urls': lr[6] or [],
            }

            bot_username = os.environ.get('TELEGRAM_BOT_USERNAME', '').strip().lstrip('@')
            if not bot_username:
                _, me = tg_api(bot_token, 'getMe', {})
                bot_username = me.get('username') if isinstance(me, dict) else None
            caption = build_caption(lot)
            keyboard = lot_keyboard(bot_username, lot['id'])
            photo = lot['photo_urls'][0] if lot['photo_urls'] else None

            cur.execute(
                "SELECT id, chat_id FROM auction_channels WHERE id = ANY(%s)",
                (list(channel_ids),)
            )
            targets = cur.fetchall()
            published, failed = 0, []
            for ch_id, chat_id in targets:
                if photo:
                    ok_send, res = tg_api(bot_token, 'sendPhoto', {
                        'chat_id': chat_id, 'photo': photo, 'caption': caption,
                        'parse_mode': 'HTML', 'reply_markup': keyboard,
                    })
                else:
                    ok_send, res = tg_api(bot_token, 'sendMessage', {
                        'chat_id': chat_id, 'text': caption,
                        'parse_mode': 'HTML', 'reply_markup': keyboard,
                    })
                if ok_send:
                    message_id = res.get('message_id')
                    cur.execute(
                        """INSERT INTO auction_lot_channels (lot_id, channel_id, message_id, status)
                           VALUES (%s, %s, %s, 'published')
                           ON CONFLICT (lot_id, channel_id)
                           DO UPDATE SET message_id = EXCLUDED.message_id, status = 'published'""",
                        (lot['id'], ch_id, message_id)
                    )
                    published += 1
                else:
                    failed.append(str(res))
            conn.commit()
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'published': published, 'failed': failed,
            })}

        if action == 'finalize_now':
            if auction_role != 'admin':
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Только администратор может завершить досрочно'})}
            row, err = can_manage(cur, body.get('lot_id'), manager_id, auction_role)
            if err:
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}
            if row[2] != 'active':
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Завершить можно только активный лот'})}
            outcome = finalize_lot_inline(cur, bot_token, row[0])
            conn.commit()
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True, 'outcome': outcome})}

        if action == 'notify_winner_again':
            row, err = can_manage(cur, body.get('lot_id'), manager_id, auction_role)
            if err:
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}
            win_tg = body.get('telegram_id')
            cur.execute(
                """SELECT w.telegram_id, w.price, w.status, w.pay_deadline, l.title
                   FROM auction_winners w JOIN auction_lots l ON l.id = w.lot_id
                   WHERE w.lot_id = %s AND w.telegram_id = %s""",
                (row[0], win_tg)
            )
            wr = cur.fetchone()
            if not wr:
                cur.close(); conn.close()
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Победитель не найден'})}
            if wr[2] != 'awaiting_payment':
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Этот победитель уже не ожидает оплату'})}
            bot_uname = os.environ.get('TELEGRAM_BOT_USERNAME', '').strip().lstrip('@')
            if not bot_uname:
                _, me = tg_api(bot_token, 'getMe', {})
                bot_uname = me.get('username') if isinstance(me, dict) else None
            lot_url = f"https://t.me/{bot_uname}?startapp=lot_{row[0]}" if bot_uname else "https://t.me"
            dl = wr[3].strftime('%d.%m.%Y %H:%M') if wr[3] else ''
            text = (
                f"🏆 <b>Вы выиграли лот!</b>\n\n<b>{esc(wr[4])}</b>\n"
                f"Ваша цена: <b>{int(wr[1])} ₽</b>\n"
                f"Выкупите до: <b>{dl}</b>"
            )
            delivered, res = tg_api(bot_token, 'sendMessage', {
                'chat_id': wr[0], 'text': text, 'parse_mode': 'HTML',
                'reply_markup': {'inline_keyboard': [[{'text': 'Открыть лот', 'url': lot_url}]]},
            })
            if delivered:
                cur.execute("UPDATE auction_winners SET notified = true WHERE lot_id = %s AND telegram_id = %s", (row[0], win_tg))
                conn.commit()
            cur.close(); conn.close()
            if delivered:
                return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': False, 'error': str(res)})}

        if action == 'cancel':
            row, err = can_manage(cur, body.get('lot_id'), manager_id, auction_role)
            if err:
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}
            if row[2] == 'cancelled':
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Лот уже отменён'})}
            cur.execute(
                "UPDATE auction_lots SET status = 'cancelled', cancelled_at = now() WHERE id = %s",
                (row[0],)
            )
            mark_posts(cur, bot_token, row[0], 'Лот отменён')
            conn.commit()
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

        if action == 'delete':
            row, err = can_manage(cur, body.get('lot_id'), manager_id, auction_role)
            if err:
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}
            if row[2] not in ('cancelled', 'finished', 'unsold', 'payment'):
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Сначала отмените лот'})}
            lot_pk = row[0]
            cur.execute("DELETE FROM auction_payments WHERE lot_id = %s", (lot_pk,))
            cur.execute("DELETE FROM auction_winners WHERE lot_id = %s", (lot_pk,))
            cur.execute("DELETE FROM auction_bids WHERE lot_id = %s", (lot_pk,))
            cur.execute("DELETE FROM auction_lot_channels WHERE lot_id = %s", (lot_pk,))
            cur.execute("DELETE FROM auction_lot_posts WHERE lot_id = %s", (lot_pk,))
            cur.execute("DELETE FROM auction_lots WHERE id = %s", (lot_pk,))
            conn.commit()
            delete_photos(row[3] or [])
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

        if action == 'update':
            row, err = can_manage(cur, body.get('lot_id'), manager_id, auction_role)
            if err:
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': err})}
            if row[2] in ('cancelled', 'finished'):
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нельзя редактировать завершённый или отменённый лот'})}

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
                    ends_at = parse_ends_at(ends_at_raw)
                except ValueError:
                    errors.append('Некорректный срок окончания')
            if errors:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': '; '.join(errors)})}

            old_urls = row[3] or []
            new_urls = upload_photos(photos)
            removed = [u for u in old_urls if u not in new_urls]

            cur.execute(
                """UPDATE auction_lots
                   SET title = %s, description = %s, desired_price = %s, quantity = %s,
                       ends_at = %s, payment_deadline_minutes = %s, photo_urls = %s
                   WHERE id = %s""",
                (title, description, desired_price, quantity, ends_at,
                 payment_deadline, new_urls, row[0])
            )
            conn.commit()
            delete_photos(removed)
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True, 'photo_urls': new_urls})}

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