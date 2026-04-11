import json
import os
import urllib.request

def handler(event: dict, context) -> dict:
    """Настройка Telegram-бота: установка webhook и получение информации о боте"""
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
    params = event.get('queryStringParameters') or {}
    action = params.get('action', 'info')
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')

    if not bot_token:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'TELEGRAM_BOT_TOKEN не настроен'})}

    if method == 'GET' and action == 'info':
        url = f'https://api.telegram.org/bot{bot_token}/getMe'
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            bot = data.get('result', {})
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'bot': {'username': bot.get('username'), 'first_name': bot.get('first_name'), 'id': bot.get('id')}})}
        except Exception as e:
            return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}

    if method == 'POST' and action == 'set_webhook':
        body = json.loads(event.get('body') or '{}')
        webhook_url = body.get('webhook_url', '')
        if not webhook_url:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите webhook_url'})}

        url = f'https://api.telegram.org/bot{bot_token}/setWebhook'
        payload = json.dumps({'url': webhook_url}).encode()
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps(data)}
        except Exception as e:
            return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}

    return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Not found'})}
