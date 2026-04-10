import json
import os
import urllib.request
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
        url = f'https://api.telegram.org/bot{bot_token}/getUpdates'
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read().decode())
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

        url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
        payload = json.dumps({'chat_id': chat_id, 'text': text, 'parse_mode': parse_mode}).encode()
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            if data.get('ok'):
                return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True, 'message_id': data.get('result', {}).get('message_id')})}
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': data.get('description', 'Ошибка отправки')})}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            try:
                err_data = json.loads(err_body)
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': err_data.get('description', str(e))})}
            except Exception:
                return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': f'HTTP {e.code}: {err_body}'})}
        except Exception as e:
            return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': f'Ошибка: {str(e)}'})}

    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}
