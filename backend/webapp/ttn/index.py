import json
import os
import uuid
import base64
import boto3
import psycopg2


def handler(event: dict, context) -> dict:
    '''Загрузка образцов ТТН (.xlsx) в S3 и хранение списка в БД.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    cors = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    dsn = os.environ['DATABASE_URL']
    schema = 't_p69702834_empty_site_creation_'

    if method == 'GET':
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        cur.execute(
            f'SELECT id, filename, cdn_url, uploaded_at FROM {schema}.ttn_files ORDER BY uploaded_at DESC'
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        files = [
            {'id': r[0], 'filename': r[1], 'cdn_url': r[2], 'uploaded_at': r[3].isoformat()}
            for r in rows
        ]
        return {'statusCode': 200, 'headers': cors, 'isBase64Encoded': False,
                'body': json.dumps({'files': files}, ensure_ascii=False)}

    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        filename = body.get('filename', 'file.xlsx')
        file_b64 = body.get('file', '')
        if not file_b64:
            return {'statusCode': 400, 'headers': cors, 'isBase64Encoded': False,
                    'body': json.dumps({'error': 'Файл не передан'}, ensure_ascii=False)}

        data = base64.b64decode(file_b64)
        key = f'ttn/{uuid.uuid4().hex}.xlsx'

        s3 = boto3.client(
            's3',
            endpoint_url='https://bucket.poehali.dev',
            aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        )
        s3.put_object(
            Bucket='files', Key=key, Body=data,
            ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        safe_name = filename.replace("'", "''")
        cur.execute(
            f"INSERT INTO {schema}.ttn_files (filename, s3_key, cdn_url) "
            f"VALUES ('{safe_name}', '{key}', '{cdn_url}') RETURNING id"
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        return {'statusCode': 200, 'headers': cors, 'isBase64Encoded': False,
                'body': json.dumps({'id': new_id, 'filename': filename, 'cdn_url': cdn_url},
                                   ensure_ascii=False)}

    return {'statusCode': 405, 'headers': cors, 'isBase64Encoded': False,
            'body': json.dumps({'error': 'Method not allowed'}, ensure_ascii=False)}
