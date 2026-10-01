"""Excel для оптовиков: выгрузка заявки и прайс-лист."""
from order_excel import order_excel
from price_list import price_list

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
    'Access-Control-Max-Age': '86400',
}


def handler(event: dict, context) -> dict:
    """Excel-файлы для оптовиков: kind=order — заявка с формулами (по id), kind=price — прайс-лист по заявкам или по периоду и фирмам."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}
    kind = (event.get('queryStringParameters') or {}).get('kind', 'price')
    if kind == 'order':
        return order_excel(event)
    return price_list(event)
