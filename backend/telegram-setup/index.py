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

    if method == 'GET' and action == 'webhook_info':
        url = f'https://api.telegram.org/bot{bot_token}/getWebhookInfo'
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            info = data.get('result', {})
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'url': info.get('url', ''),
                'has_custom_certificate': info.get('has_custom_certificate', False),
                'pending_update_count': info.get('pending_update_count', 0),
                'last_error_date': info.get('last_error_date'),
                'last_error_message': info.get('last_error_message', ''),
                'ip_address': info.get('ip_address', '')
            })}
        except Exception as e:
            return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}

    if method == 'POST' and action == 'set_webhook':
        body = json.loads(event.get('body') or '{}')
        webhook_url = body.get('webhook_url', '')
        if not webhook_url:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите webhook_url'})}

        webhook_secret = os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')
        if not webhook_secret:
            return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'TELEGRAM_WEBHOOK_SECRET не настроен'})}

        url = f'https://api.telegram.org/bot{bot_token}/setWebhook'
        payload = json.dumps({'url': webhook_url, 'secret_token': webhook_secret}).encode()
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
        except Exception as e:
            return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}

        menu_result = _set_menu_button(bot_token)
        data['menu_button'] = menu_result
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps(data)}

    if method == 'POST' and action == 'set_menu_button':
        result = _set_menu_button(bot_token)
        status = 200 if result.get('ok') else 500
        return {'statusCode': status, 'headers': headers, 'body': json.dumps(result)}

    return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Not found'})}


def _set_menu_button(bot_token: str) -> dict:
    """Ставит синюю кнопку слева, открывающую мини-приложение аукциона"""
    base_url = os.environ.get('WEBAPP_BASE_URL', '').strip().rstrip('/')
    if not base_url:
        return {'ok': False, 'error': 'WEBAPP_BASE_URL не настроен'}

    webapp_url = f'{base_url}/tma'
    payload = json.dumps({
        'menu_button': {
            'type': 'web_app',
            'text': 'Открыть',
            'web_app': {'url': webapp_url}
        }
    }).encode()
    url = f'https://api.telegram.org/bot{bot_token}/setChatMenuButton'
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {'ok': False, 'error': str(e)}