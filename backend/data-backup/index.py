import json
import os
import gzip
import hashlib
import time
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
import psycopg2
import boto3

MSK = timezone(timedelta(hours=3))
SESSION_TABLES = {'user_sessions', 'owner_sessions', 'login_codes'}
BACKUP_PREFIX = 'backups/'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def get_s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def resp(status, body):
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(body, default=str)}


def get_token(event):
    headers = event.get('headers', {}) or {}
    auth = headers.get('X-Authorization') or headers.get('Authorization') or ''
    return auth.replace('Bearer ', '').strip()


def check_owner(cur, token):
    if not token:
        return False
    cur.execute(
        """SELECT u.role FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,)
    )
    row = cur.fetchone()
    return bool(row and row[0] == 'owner')


def get_schema(cur):
    cur.execute("SELECT current_schema()")
    return cur.fetchone()[0]


def list_tables(cur, schema):
    cur.execute(
        """SELECT table_name FROM information_schema.tables
           WHERE table_schema = %s AND table_type = 'BASE TABLE'
           ORDER BY table_name""",
        (schema,)
    )
    return [r[0] for r in cur.fetchall()]


def json_default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (bytes, memoryview)):
        return bytes(o).hex()
    return str(o)


# ---------- CREATE ----------

def do_create(cur, conn, backup_type='manual', is_protected=False, note=None):
    start = time.time()
    schema = get_schema(cur)
    tables = list_tables(cur, schema)
    dump = {'schema': schema, 'created_at': datetime.now(MSK).isoformat(), 'tables': {}}
    total_rows = 0

    cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    for t in tables:
        cur.execute('SELECT * FROM "{}"."{}"'.format(schema, t))
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        dump['tables'][t] = {
            'columns': cols,
            'rows': [list(r) for r in rows],
        }
        total_rows += len(rows)

    payload = json.dumps(dump, default=json_default).encode('utf-8')
    gz = gzip.compress(payload)
    checksum = hashlib.sha256(gz).hexdigest()

    ts = datetime.now(MSK).strftime('%Y%m%d_%H%M%S')
    key = '{}backup_{}_{}.json.gz'.format(BACKUP_PREFIX, ts, checksum[:8])

    s3 = get_s3()
    s3.put_object(Bucket='files', Key=key, Body=gz, ContentType='application/gzip')

    duration = round(time.time() - start, 2)
    cur.execute(
        """INSERT INTO backups
           (s3_key, size_bytes, tables_count, rows_count, type, is_protected, note, status, checksum, duration_sec)
           VALUES (%s, %s, %s, %s, %s, %s, %s, 'success', %s, %s) RETURNING id, created_at""",
        (key, len(gz), len(tables), total_rows, backup_type, is_protected, note, checksum, duration)
    )
    bid, created_at = cur.fetchone()
    conn.commit()
    return {
        'id': bid, 'created_at': str(created_at), 's3_key': key,
        'size_bytes': len(gz), 'tables_count': len(tables), 'rows_count': total_rows,
        'duration_sec': duration, 'status': 'success',
    }


def record_failure(conn, backup_type, is_protected, note, err):
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO backups (type, is_protected, note, status, error_message)
               VALUES (%s, %s, %s, 'failed', %s)""",
            (backup_type, is_protected, note, str(err)[:1000])
        )
        conn.commit()
    except Exception:
        pass


# ---------- ROTATION ----------

def do_rotate(cur, conn, retention_days, retention_count):
    s3 = get_s3()
    cutoff = datetime.now(MSK) - timedelta(days=retention_days)
    cur.execute(
        """SELECT id, s3_key, created_at FROM backups
           WHERE status = 'success' AND is_protected = FALSE AND type IN ('auto','manual')
           ORDER BY created_at DESC"""
    )
    rows = cur.fetchall()
    to_delete = []
    for idx, (bid, key, created_at) in enumerate(rows):
        ca = created_at if created_at.tzinfo else created_at.replace(tzinfo=MSK)
        if idx >= retention_count or ca < cutoff:
            to_delete.append((bid, key))
    for bid, key in to_delete:
        if key:
            try:
                s3.delete_object(Bucket='files', Key=key)
            except Exception:
                pass
        cur.execute("DELETE FROM backups WHERE id = %s", (bid,))
    conn.commit()
    return len(to_delete)


# ---------- RESTORE ----------

def do_restore(cur, conn, backup_id):
    cur.execute("SELECT s3_key, checksum, status FROM backups WHERE id = %s", (backup_id,))
    row = cur.fetchone()
    if not row:
        return resp(404, {'error': 'Копия не найдена'})
    key, checksum, status = row
    if status != 'success' or not key:
        return resp(400, {'error': 'Копия повреждена или незавершена'})

    s3 = get_s3()
    obj = s3.get_object(Bucket='files', Key=key)
    gz = obj['Body'].read()

    if checksum and hashlib.sha256(gz).hexdigest() != checksum:
        return resp(400, {'error': 'Контрольная сумма копии не совпала. Восстановление отменено.'})

    try:
        dump = json.loads(gzip.decompress(gz).decode('utf-8'))
    except Exception:
        return resp(400, {'error': 'Не удалось распаковать копию. Восстановление отменено.'})

    if 'tables' not in dump or not dump['tables']:
        return resp(400, {'error': 'В копии нет данных. Восстановление отменено.'})

    schema = get_schema(cur)
    existing = set(list_tables(cur, schema))
    missing = [t for t in dump['tables'].keys() if t not in existing]
    if missing:
        return resp(400, {'error': 'В базе нет таблиц из копии: {}'.format(', '.join(missing))})

    # авто-страховочная защищённая копия текущего состояния
    pre = do_create(cur, conn, backup_type='pre_restore', is_protected=True,
                    note='Авто-страховка перед восстановлением #{}'.format(backup_id))

    target_tables = [t for t in dump['tables'].keys() if t not in SESSION_TABLES]

    cur.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
    cur.execute("SET CONSTRAINTS ALL DEFERRED")
    try:
        for t in reversed(target_tables):
            cur.execute('TRUNCATE TABLE "{}"."{}" CASCADE'.format(schema, t))
        restored_rows = 0
        for t in target_tables:
            tdata = dump['tables'][t]
            cols = tdata['columns']
            rows = tdata['rows']
            if not rows:
                continue
            collist = ','.join('"{}"'.format(c) for c in cols)
            ph = ','.join(['%s'] * len(cols))
            sql = 'INSERT INTO "{}"."{}" ({}) VALUES ({})'.format(schema, t, collist, ph)
            cur.executemany(sql, [tuple(r) for r in rows])
            restored_rows += len(rows)
        # пересинхрон sequences
        cur.execute(
            """SELECT c.table_name, c.column_name, pg_get_serial_sequence(
                   quote_ident(%s)||'.'||quote_ident(c.table_name), c.column_name)
               FROM information_schema.columns c
               WHERE c.table_schema = %s""",
            (schema, schema)
        )
        for tname, cname, seq in cur.fetchall():
            if seq and tname in target_tables:
                cur.execute(
                    'SELECT setval(%s, COALESCE((SELECT MAX("{}") FROM "{}"."{}"), 1))'.format(cname, schema, tname),
                    (seq,)
                )
        conn.commit()
    except Exception as e:
        conn.rollback()
        return resp(500, {'error': 'Ошибка восстановления, данные не изменены: {}'.format(str(e)[:300]),
                          'safety_backup_id': pre['id']})

    return resp(200, {
        'success': True,
        'restored_tables': len(target_tables),
        'restored_rows': restored_rows,
        'skipped_session_tables': sorted(SESSION_TABLES & set(dump['tables'].keys())),
        'safety_backup_id': pre['id'],
    })


# ---------- SETTINGS / LIST / DELETE ----------

def get_settings_row(cur):
    cur.execute(
        """SELECT auto_enabled, mode, interval_minutes, daily_every_days, daily_time,
                  timezone, retention_days, retention_count, function_timeout_sec, last_backup_at
           FROM backup_settings WHERE id = 1"""
    )
    r = cur.fetchone()
    keys = ['auto_enabled', 'mode', 'interval_minutes', 'daily_every_days', 'daily_time',
            'timezone', 'retention_days', 'retention_count', 'function_timeout_sec', 'last_backup_at']
    return dict(zip(keys, r))


def do_list(cur):
    cur.execute(
        """SELECT id, created_at, size_bytes, tables_count, rows_count, type,
                  is_protected, note, status, error_message, duration_sec
           FROM backups ORDER BY created_at DESC LIMIT 500"""
    )
    cols = ['id', 'created_at', 'size_bytes', 'tables_count', 'rows_count', 'type',
            'is_protected', 'note', 'status', 'error_message', 'duration_sec']
    common, protected = [], []
    for row in cur.fetchall():
        item = dict(zip(cols, row))
        if item['is_protected']:
            protected.append(item)
        else:
            common.append(item)
    return {'common': common, 'protected': protected}


def do_delete(cur, conn, backup_id):
    cur.execute("SELECT s3_key FROM backups WHERE id = %s", (backup_id,))
    row = cur.fetchone()
    if not row:
        return resp(404, {'error': 'Копия не найдена'})
    key = row[0]
    if key:
        try:
            get_s3().delete_object(Bucket='files', Key=key)
        except Exception:
            pass
    cur.execute("DELETE FROM backups WHERE id = %s", (backup_id,))
    conn.commit()
    return resp(200, {'success': True})


# ---------- TICK ----------

def should_run(settings, now_msk):
    if not settings['auto_enabled']:
        return False
    last = settings['last_backup_at']
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=MSK)
    if settings['mode'] == 'interval':
        mins = max(15, int(settings['interval_minutes']))
        if last is None:
            return True
        return now_msk >= last + timedelta(minutes=mins)
    else:
        try:
            hh, mm = [int(x) for x in str(settings['daily_time']).split(':')]
        except Exception:
            hh, mm = 3, 0
        every = max(1, int(settings['daily_every_days']))
        scheduled = now_msk.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if now_msk < scheduled:
            return False
        if last is None:
            return True
        return last < scheduled and (now_msk.date() - last.date()).days >= every - 1


def do_tick(cur, conn):
    settings = get_settings_row(cur)
    now_msk = datetime.now(MSK)
    if not should_run(settings, now_msk):
        return resp(200, {'ran': False})
    try:
        result = do_create(cur, conn, backup_type='auto', is_protected=False, note=None)
    except Exception as e:
        record_failure(conn, 'auto', False, None, e)
        return resp(200, {'ran': True, 'success': False, 'error': str(e)[:300]})
    cur.execute("UPDATE backup_settings SET last_backup_at = NOW() WHERE id = 1")
    conn.commit()
    do_rotate(cur, conn, int(settings['retention_days']), int(settings['retention_count']))
    return resp(200, {'ran': True, 'success': True, 'backup': result})


def handler(event: dict, context) -> dict:
    """Архивация данных: создание/восстановление/список резервных копий БД в S3, настройки автобэкапа и автозапуск по расписанию"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')
    action = params.get('action') or body.get('action') or ''
    token = get_token(event)

    conn = get_db()
    cur = conn.cursor()
    try:
        if not check_owner(cur, token):
            return resp(401, {'error': 'Доступ только для владельца'})

        if action == 'get_settings':
            return resp(200, {'settings': get_settings_row(cur)})

        if action == 'save_settings':
            s = body.get('settings', {})
            cur.execute(
                """UPDATE backup_settings SET
                       auto_enabled = %s, mode = %s, interval_minutes = %s,
                       daily_every_days = %s, daily_time = %s, retention_days = %s,
                       retention_count = %s, function_timeout_sec = %s, updated_at = NOW()
                   WHERE id = 1""",
                (bool(s.get('auto_enabled')), s.get('mode', 'daily'),
                 max(15, int(s.get('interval_minutes', 60))),
                 max(1, int(s.get('daily_every_days', 1))), s.get('daily_time', '03:00'),
                 max(1, int(s.get('retention_days', 30))), max(1, int(s.get('retention_count', 30))),
                 max(5, int(s.get('function_timeout_sec', 60))))
            )
            conn.commit()
            return resp(200, {'success': True, 'settings': get_settings_row(cur)})

        if action == 'list':
            return resp(200, do_list(cur))

        if action == 'create':
            is_protected = bool(body.get('is_protected'))
            note = body.get('note')
            try:
                result = do_create(cur, conn, backup_type='manual', is_protected=is_protected, note=note)
            except Exception as e:
                record_failure(conn, 'manual', is_protected, note, e)
                return resp(200, {'success': False, 'error': str(e)[:300]})
            s = get_settings_row(cur)
            do_rotate(cur, conn, int(s['retention_days']), int(s['retention_count']))
            return resp(200, {'success': True, 'backup': result})

        if action == 'restore':
            bid = body.get('backup_id')
            if not bid:
                return resp(400, {'error': 'Не указан backup_id'})
            return do_restore(cur, conn, int(bid))

        if action == 'delete':
            bid = body.get('backup_id')
            if not bid:
                return resp(400, {'error': 'Не указан backup_id'})
            return do_delete(cur, conn, int(bid))

        if action == 'tick':
            return do_tick(cur, conn)

        return resp(400, {'error': 'Неизвестное действие'})
    finally:
        cur.close()
        conn.close()