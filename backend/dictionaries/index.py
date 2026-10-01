"""Справочники: бренды, категории каталога, шаблоны этикеток."""
import json
from brands import brands_handler
from categories import categories_handler
from labels import labels_handler

SECTIONS = {
    'brands': brands_handler,
    'categories': categories_handler,
    'labels': labels_handler,
}


def handler(event: dict, context) -> dict:
    """Справочники: section=brands — бренды, section=categories — категории каталога, section=labels — шаблоны этикеток и выбранный шаблон пользователя."""
    section = (event.get('queryStringParameters') or {}).get('section', '')
    fn = SECTIONS.get(section)
    if fn:
        return fn(event, context)
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
            'Access-Control-Max-Age': '86400'}, 'body': ''}
    return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Не указан раздел справочника'}, ensure_ascii=False)}
