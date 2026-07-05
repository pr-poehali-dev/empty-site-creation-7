import json
import os
import psycopg2
import boto3


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def get_owner_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.phone FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW() AND u.role = 'owner'""",
        (token,)
    )
    return cur.fetchone()


def s3_client():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def used_keys(cur):
    """Ключи S3, реально используемые лотами (auction/<uuid>.<ext>)."""
    prefix = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/"
    cur.execute("SELECT unnest(photo_urls) FROM auction_lots WHERE photo_urls IS NOT NULL")
    keys = set()
    for (url,) in cur.fetchall():
        if isinstance(url, str) and url.startswith(prefix):
            keys.add(url[len(prefix):])
    return keys


def cleanup_orphans(cur, dry_run):
    """Удаляет из папки auction/ файлы, на которые не ссылается ни один лот."""
    s3 = s3_client()
    active = used_keys(cur)
    scanned = 0
    orphans = []
    token = None
    while True:
        kwargs = {'Bucket': 'files', 'Prefix': 'auction/', 'MaxKeys': 1000}
        if token:
            kwargs['ContinuationToken'] = token
        resp = s3.list_objects_v2(**kwargs)
        for obj in resp.get('Contents', []):
            key = obj['Key']
            if key.endswith('/'):
                continue
            scanned += 1
            if key not in active:
                orphans.append(key)
        if resp.get('IsTruncated'):
            token = resp.get('NextContinuationToken')
        else:
            break

    deleted = 0
    if not dry_run and orphans:
        for i in range(0, len(orphans), 1000):
            batch = orphans[i:i + 1000]
            s3.delete_objects(
                Bucket='files',
                Delete={'Objects': [{'Key': k} for k in batch], 'Quiet': True}
            )
            deleted += len(batch)

    return {
        'scanned': scanned,
        'used': len(active),
        'orphans': len(orphans),
        'deleted': deleted,
        'dry_run': dry_run,
    }


def handler(event: dict, context) -> dict:
    """Административные операции аукциона для владельца: очистка неиспользуемых фото."""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    method = event.get('httpMethod', 'GET')

    if method != 'POST':
        return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}

    req_headers = event.get('headers', {})
    auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db()
    cur = conn.cursor()

    owner = get_owner_by_token(cur, token)
    if not owner:
        cur.close()
        conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    try:
        body = json.loads(event.get('body') or '{}')
    except (ValueError, TypeError):
        body = {}
    action = body.get('action', '')

    if action == 'cleanup_orphan_photos':
        dry_run = bool(body.get('dry_run', False))
        result = cleanup_orphans(cur, dry_run)
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps(result)}

    cur.close()
    conn.close()
    return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Неизвестное действие'})}
