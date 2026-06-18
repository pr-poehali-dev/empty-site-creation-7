"""ТТН: загрузка Excel-файлов в S3 и получение списка загруженных файлов"""
import json
import os
import base64
import uuid
import psycopg2
import boto3


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def get_user_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.phone, u.role FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,)
    )
    return cur.fetchone()


def get_s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def cdn_url(key):
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def handler(event: dict, context) -> dict:
    """Загрузка Excel-файлов ТТН в хранилище и список загруженных файлов"""
    method = event.get('httpMethod')
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}

    req_headers = event.get('headers', {})
    auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()

    user = get_user_by_token(cur, token)
    if not user or user[2] != 'owner':
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    if method == 'GET':
        cur.execute(
            "SELECT id, filename, cdn_url, uploaded_at FROM ttn_files ORDER BY uploaded_at DESC"
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        files = [
            {'id': r[0], 'filename': r[1], 'cdn_url': r[2], 'uploaded_at': str(r[3])}
            for r in rows
        ]
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'files': files})}

    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        filename = (body.get('filename') or '').strip()
        file_b64 = body.get('file') or ''
        if not filename or not file_b64:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нужны filename и file'})}

        try:
            data = base64.b64decode(file_b64)
        except Exception:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Файл повреждён'})}

        key = f"ttn/{uuid.uuid4().hex}.xlsx"
        s3 = get_s3()
        s3.put_object(
            Bucket='files',
            Key=key,
            Body=data,
            ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        url = cdn_url(key)
        cur.execute(
            "INSERT INTO ttn_files (filename, s3_key, cdn_url) VALUES (%s, %s, %s) RETURNING id, uploaded_at",
            (filename, key, url)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'id': row[0], 'filename': filename, 'cdn_url': url, 'uploaded_at': str(row[1])})
        }

    cur.close(); conn.close()
    return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Метод не поддерживается'})}
