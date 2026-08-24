import json
import os
import urllib.request
import psycopg2
from tg_transport import tg_call
import urllib.parse

def handler(event: dict, context) -> dict:
    """Отправка сообщений и уведомлений в Telegram через бота"""
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
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'TELEGRAM_BOT_TOKEN не настроен'})}

    # GET — получить последние обновления (для определения chat_id)
    if method == 'GET':
        try:
            conn = psycopg2.connect(os.environ['DATABASE_URL'])
            cur = conn.cursor()
            data, _ = tg_call(cur, 'getUpdates', {}, bot_token)
            conn.commit()
            cur.close()
            conn.close()
            if not data:
                return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': why or 'Telegram недоступен'})}
            chats = []
            seen = set()
            for upd in data.get('result', []):
                msg = upd.get('message') or upd.get('edited_message') or {}
                chat = msg.get('chat', {})
                chat_id = chat.get('id')
                if chat_id and chat_id not in seen:
                    seen.add(chat_id)
                    chats.append({
                        'chat_id': chat_id,
                        'type': chat.get('type'),
                        'title': chat.get('title'),
                        'username': chat.get('username'),
                        'first_name': chat.get('first_name'),
                        'last_name': chat.get('last_name')
                    })
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'chats': chats})}
        except Exception as e:
            return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': f'Ошибка Telegram API: {str(e)}'})}

    # POST — отправить сообщение
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        chat_id = body.get('chat_id')
        text = body.get('text', '').strip()
        parse_mode = body.get('parse_mode', 'HTML')

        if not chat_id or not text:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите chat_id и text'})}

        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor()
        try:
            data, why = tg_call(cur, 'sendMessage', {'chat_id': chat_id, 'text': text, 'parse_mode': parse_mode}, bot_token)
            conn.commit()
            if data and data.get('ok'):
                return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True, 'message_id': data.get('result', {}).get('message_id'), 'route': why})}
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': why or 'Не удалось отправить сообщение'})}
        finally:
            cur.close()
            conn.close()

    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}