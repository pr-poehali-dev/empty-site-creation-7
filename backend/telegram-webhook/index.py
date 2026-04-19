import json
import os
import hmac
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def handler(event: dict, context) -> dict:
    """Вебхук Telegram-бота: привязка номера телефона к chat_id при команде /start"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}

    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}

    expected_secret = os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')
    if not expected_secret:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Webhook secret not configured'})}

    req_headers = event.get('headers') or {}
    received_secret = ''
    for k, v in req_headers.items():
        if k.lower() == 'x-telegram-bot-api-secret-token':
            received_secret = v or ''
            break

    if not received_secret or not hmac.compare_digest(received_secret, expected_secret):
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Forbidden'})}

    body = json.loads(event.get('body') or '{}')
    message = body.get('message', {})
    text = message.get('text', '').strip()
    chat = message.get('chat', {})
    chat_id = chat.get('id')

    if not chat_id or not text:
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if text.startswith('/start'):
        parts = text.split(maxsplit=1)
        if len(parts) == 2:
            phone_raw = parts[1].strip()
            phone = phone_raw.replace('-', '').replace(' ', '').replace('(', '').replace(')', '')
            if not phone.startswith('+'):
                phone = '+' + phone

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT id, telegram_chat_id FROM users WHERE phone = %s", (phone,))
            user = cur.fetchone()

            if user:
                cur.execute("UPDATE users SET telegram_chat_id = %s WHERE phone = %s", (chat_id, phone))

                cur.execute("SELECT id, status FROM managers WHERE phone = %s", (phone,))
                mgr = cur.fetchone()

                if mgr and mgr[1] == 'not_authorized':
                    cur.execute(
                        "UPDATE managers SET telegram_chat_id = %s, status = 'pending' WHERE phone = %s",
                        (chat_id, phone)
                    )
                    conn.commit()
                    send_message(chat_id, "Telegram привязан к номеру " + phone + ". Ожидайте авторизации владельцем.")
                    notify_owner(cur, phone)
                elif mgr:
                    cur.execute("UPDATE managers SET telegram_chat_id = %s WHERE phone = %s", (chat_id, phone))
                    conn.commit()
                    send_message(chat_id, "Telegram привязан к номеру " + phone + ". Теперь вы можете получать коды авторизации.")
                else:
                    conn.commit()
                    send_message(chat_id, "Telegram привязан к номеру " + phone + ". Теперь вы можете получать коды авторизации.")
            else:
                send_message(chat_id, "Номер " + phone + " не найден в системе. Обратитесь к администратору.")

            cur.close()
            conn.close()
        else:
            send_message(chat_id, "Добро пожаловать! Для привязки аккаунта используйте кнопку на сайте.")

    return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

def notify_owner(cur, manager_phone):
    cur.execute("SELECT telegram_chat_id FROM users WHERE role = 'owner' AND telegram_chat_id IS NOT NULL")
    owners = cur.fetchall()
    for owner in owners:
        send_message(
            owner[0],
            f"Управленец {manager_phone} привязал Telegram и ожидает авторизации.\n\nАвторизуйте его в панели управления."
        )

def send_message(chat_id, text):
    import urllib.request
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return
    url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
    payload = json.dumps({'chat_id': chat_id, 'text': text}).encode()
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass