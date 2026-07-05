import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
import psycopg2


LOW_BID_WARN_MINUTES = 30  # за сколько минут до конца предупреждать сотрудника


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def tg_api(bot_token, method, payload):
    url = f'https://api.telegram.org/bot{bot_token}/{method}'
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode())
        return bool(res.get('ok')), res.get('result') or res.get('description')
    except urllib.error.HTTPError as e:
        try:
            return False, json.loads(e.read().decode()).get('description', f'HTTP {e.code}')
        except Exception:
            return False, f'HTTP {e.code}'
    except Exception as e:
        return False, str(e)


def esc(text):
    if text is None:
        return ''
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def bot_username(bot_token):
    cached = os.environ.get('TELEGRAM_BOT_USERNAME', '').strip().lstrip('@')
    if cached:
        return cached
    ok, me = tg_api(bot_token, 'getMe', {})
    if ok and isinstance(me, dict):
        return me.get('username')
    return None


def lot_app_url(bot_token, lot_id):
    uname = bot_username(bot_token)
    if uname:
        return f'https://t.me/{uname}?startapp=lot_{lot_id}'
    return 'https://t.me'


def notify_winner(bot_token, cur, lot_id, title, telegram_id, price, deadline):
    """Личное сообщение победителю о выигрыше."""
    url = lot_app_url(bot_token, lot_id)
    dl = deadline.strftime('%d.%m.%Y %H:%M') if deadline else ''
    text = (
        f"🏆 <b>Вы выиграли лот!</b>\n\n"
        f"<b>{esc(title)}</b>\n"
        f"Ваша цена: <b>{int(price)} ₽</b>\n"
        f"Выкупите до: <b>{dl}</b>"
    )
    tg_api(bot_token, 'sendMessage', {
        'chat_id': telegram_id, 'text': text, 'parse_mode': 'HTML',
        'reply_markup': {'inline_keyboard': [[{'text': 'Открыть лот', 'url': url}]]},
    })


def notify_staff_low_bids(bot_token, cur, lot):
    """Предупреждение сотруднику: ставок меньше, чем товара. Оператору без цен, админу со ставками."""
    cur.execute(
        "SELECT telegram_chat_id, auction_role FROM managers WHERE id = %s",
        (lot['created_by'],)
    )
    row = cur.fetchone()
    if not row or not row[0]:
        return
    chat_id, role = row[0], row[1]
    url = lot_app_url(bot_token, lot['id'])
    lines = [
        "⚠️ <b>Лот скоро завершится</b>",
        "",
        f"<b>{esc(lot['title'])}</b>",
        f"Ставок: {lot['bids_count']} · Товара: {lot['quantity']} шт.",
    ]
    if role == 'admin':
        cur.execute(
            "SELECT price FROM auction_bids WHERE lot_id = %s ORDER BY price DESC, created_at ASC LIMIT %s",
            (lot['id'], lot['quantity'])
        )
        prices = [int(r[0]) for r in cur.fetchall()]
        if prices:
            lines.append("Ставки: " + ", ".join(f"{p} ₽" for p in prices))
        lines.append("")
        lines.append("Можно завершить досрочно, чтобы ставки сыграли.")
    else:
        lines.append("")
        lines.append("Товара больше, чем ставок.")
    tg_api(bot_token, 'sendMessage', {
        'chat_id': chat_id, 'text': '\n'.join(lines), 'parse_mode': 'HTML',
        'reply_markup': {'inline_keyboard': [[{'text': 'Открыть лот', 'url': url}]]},
    })


def mark_posts_closed(bot_token, cur, lot_id, note):
    """Обновляет посты лота в каналах: пометка + убираем кнопку."""
    cur.execute(
        """SELECT p.message_id, c.chat_id
           FROM auction_lot_channels p
           JOIN auction_channels c ON c.id = p.channel_id
           WHERE p.lot_id = %s AND p.status = 'published'""",
        (lot_id,)
    )
    for message_id, chat_id in cur.fetchall():
        if message_id:
            tg_api(bot_token, 'editMessageCaption', {
                'chat_id': chat_id, 'message_id': message_id,
                'caption': f"<b>{esc(note)}</b>", 'parse_mode': 'HTML',
            })
    cur.execute(
        "UPDATE auction_lot_channels SET status = 'closed' WHERE lot_id = %s AND status = 'published'",
        (lot_id,)
    )


def finalize_lot(bot_token, cur, lot):
    """Подводит итоги одного лота: отбирает победителей, шлёт уведомления, меняет статус."""
    lot_id = lot['id']
    quantity = lot['quantity']
    deadline_min = lot['payment_deadline_minutes'] or 60

    cur.execute(
        """SELECT telegram_id, username, display_name, price
           FROM auction_bids
           WHERE lot_id = %s
           ORDER BY price DESC, created_at ASC""",
        (lot_id,)
    )
    bids = cur.fetchall()

    if not bids:
        cur.execute(
            "UPDATE auction_lots SET status = 'unsold', finalized_at = now() WHERE id = %s",
            (lot_id,)
        )
        mark_posts_closed(bot_token, cur, lot_id, 'Аукцион завершён — лот не сыгран')
        return 'unsold'

    deadline = now_utc() + timedelta(minutes=deadline_min)
    winners_count = min(quantity, len(bids))

    for idx, (tg_id, uname, dname, price) in enumerate(bids):
        position = idx + 1
        if position <= winners_count:
            status = 'awaiting_payment'
            pay_deadline = deadline
        else:
            status = 'reserve'
            pay_deadline = None
        cur.execute(
            """INSERT INTO auction_winners
                 (lot_id, telegram_id, username, display_name, price, position, win_type, status, pay_deadline)
               VALUES (%s, %s, %s, %s, %s, %s, 'auction', %s, %s)
               ON CONFLICT (lot_id, telegram_id) DO UPDATE SET
                 price = EXCLUDED.price, position = EXCLUDED.position,
                 status = EXCLUDED.status, pay_deadline = EXCLUDED.pay_deadline""",
            (lot_id, tg_id, uname, dname, price, position, status, pay_deadline)
        )
        if position <= winners_count:
            notify_winner(bot_token, cur, lot_id, lot['title'], tg_id, price, deadline)

    cur.execute(
        "UPDATE auction_lots SET status = 'payment', finalized_at = now() WHERE id = %s",
        (lot_id,)
    )
    mark_posts_closed(bot_token, cur, lot_id, 'Аукцион завершён — подводим итоги')
    return 'payment'


def process_expired_payments(bot_token, cur):
    """Переход права: у кого дедлайн прошёл и не оплачено → expired, поднимаем следующего из резерва."""
    cur.execute(
        """SELECT w.id, w.lot_id, w.position, l.title, l.payment_deadline_minutes
           FROM auction_winners w
           JOIN auction_lots l ON l.id = w.lot_id
           WHERE w.status = 'awaiting_payment'
             AND w.pay_deadline IS NOT NULL
             AND w.pay_deadline <= now()"""
    )
    expired = cur.fetchall()
    for win_id, lot_id, position, title, deadline_min in expired:
        cur.execute("UPDATE auction_winners SET status = 'expired' WHERE id = %s", (win_id,))
        # поднимаем ближайший резерв
        cur.execute(
            """SELECT id, telegram_id, price FROM auction_winners
               WHERE lot_id = %s AND status = 'reserve'
               ORDER BY position ASC LIMIT 1""",
            (lot_id,)
        )
        nxt = cur.fetchone()
        if nxt:
            new_deadline = now_utc() + timedelta(minutes=deadline_min or 60)
            cur.execute(
                "UPDATE auction_winners SET status = 'awaiting_payment', pay_deadline = %s WHERE id = %s",
                (new_deadline, nxt[0])
            )
            notify_winner(bot_token, cur, lot_id, title, nxt[1], nxt[2], new_deadline)
        else:
            # резерва нет — если больше нет ожидающих оплату, лот завершён
            cur.execute(
                "SELECT COUNT(*) FROM auction_winners WHERE lot_id = %s AND status = 'awaiting_payment'",
                (lot_id,)
            )
            if cur.fetchone()[0] == 0:
                cur.execute(
                    "UPDATE auction_lots SET status = 'finished' WHERE id = %s AND status = 'payment'",
                    (lot_id,)
                )


def warn_low_bids(bot_token, cur):
    """Предупреждает сотрудника заранее о лотах, где ставок меньше товара."""
    warn_until = now_utc() + timedelta(minutes=LOW_BID_WARN_MINUTES)
    cur.execute(
        """SELECT l.id, l.title, l.quantity, l.created_by,
                  (SELECT COUNT(*) FROM auction_bids b WHERE b.lot_id = l.id) AS bids_count
           FROM auction_lots l
           WHERE l.status = 'active'
             AND l.low_bids_warned = false
             AND l.ends_at > now()
             AND l.ends_at <= %s""",
        (warn_until,)
    )
    for r in cur.fetchall():
        lot = {'id': r[0], 'title': r[1], 'quantity': r[2], 'created_by': r[3], 'bids_count': r[4]}
        if lot['bids_count'] < lot['quantity']:
            notify_staff_low_bids(bot_token, cur, lot)
        cur.execute("UPDATE auction_lots SET low_bids_warned = true WHERE id = %s", (lot['id'],))


def run_finalize(cur, bot_token, force_lot_id=None):
    """Основной проход: предупреждения, завершение по времени, переход по неоплате."""
    result = {'warned': 0, 'finalized': [], 'expired_processed': True}

    if force_lot_id is None:
        warn_low_bids(bot_token, cur)

    # лоты к завершению
    if force_lot_id is not None:
        cur.execute(
            """SELECT id, title, quantity, payment_deadline_minutes, created_by
               FROM auction_lots WHERE id = %s AND status = 'active'""",
            (force_lot_id,)
        )
    else:
        cur.execute(
            """SELECT id, title, quantity, payment_deadline_minutes, created_by
               FROM auction_lots
               WHERE status = 'active' AND ends_at <= now()"""
        )
    to_finalize = cur.fetchall()
    for r in to_finalize:
        lot = {'id': r[0], 'title': r[1], 'quantity': r[2],
               'payment_deadline_minutes': r[3], 'created_by': r[4]}
        outcome = finalize_lot(bot_token, cur, lot)
        result['finalized'].append({'lot_id': lot['id'], 'outcome': outcome})

    process_expired_payments(bot_token, cur)
    return result


def handler(event: dict, context) -> dict:
    """Подведение итогов аукциона: завершает истёкшие лоты, отбирает победителей, уведомляет и передаёт право при неоплате. Вызывается по расписанию или при обращении."""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Бот не настроен'})}

    conn = get_db()
    cur = conn.cursor()
    try:
        result = run_finalize(cur, bot_token)
        conn.commit()
    finally:
        cur.close()
        conn.close()
    return {'statusCode': 200, 'headers': headers, 'body': json.dumps(result)}
