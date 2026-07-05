"""
==============================================================================
ТОЛКАТЕЛЬ (планировщик) — единый будильник сайта
==============================================================================
Один крон вызывает эту функцию раз в минуту режимом ?action=run&key=<SECRET>.
Она обходит расписание (scheduler_jobs) и вызывает функции, у которых настал
срок (по интервалу interval_minutes). Больше НИ ОДНУ функцию в крон не сажаем.

КАК ЗАРЕГИСТРИРОВАТЬ НОВУЮ ФУНКЦИЮ ПОД РАСПИСАНИЕ (белый список):
  Добавить строку в таблицу scheduler_allowed миграцией:
    INSERT INTO scheduler_allowed (func_name, title, description, func_url)
    VALUES ('my-func', 'Название для владельца', 'Что делает', '<URL из func2url>')
    ON CONFLICT (func_name) DO UPDATE SET ...;
  Только функции из scheduler_allowed видны владельцу при добавлении задания —
  случайную функцию на таймер повесить нельзя.

ВАЖНО про URL в белом списке:
  - обычную функцию регистрируем с чистым URL;
  - функцию, которую нужно звать защищённым режимом (напр. рассылку),
    регистрируем с '?action=run' в URL — call_function сам подставит &key=<SECRET>
    из окружения SCHEDULER_SECRET (ключ нигде в БД не хранится).
==============================================================================
"""
import json
import os
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
import psycopg2


def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_user_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.role FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,)
    )
    return cur.fetchone()


def call_function(url):
    """Вызывает функцию по её URL. Возвращает (ok, info)."""
    # если функция ждёт запуск по расписанию (action=run) — подставляем внутренний ключ
    if 'action=run' in url and 'key=' not in url:
        secret = os.environ.get('SCHEDULER_SECRET', '').strip()
        if secret:
            url = url + ('&' if '?' in url else '?') + 'key=' + urllib.parse.quote(secret)
    req = urllib.request.Request(
        url, data=b'{}',
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            code = resp.getcode()
        return (200 <= code < 300), f'HTTP {code}'
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}'
    except Exception as e:
        return False, str(e)


def run_scheduler(cur):
    """Обходит расписание и толкает функции, у которых настал срок."""
    now = now_utc()
    cur.execute(
        """SELECT j.id, j.func_name, j.interval_minutes, j.last_run_at, a.func_url
           FROM scheduler_jobs j
           JOIN scheduler_allowed a ON a.func_name = j.func_name
           WHERE j.enabled = true"""
    )
    jobs = cur.fetchall()
    fired = []
    for job_id, func_name, interval_min, last_run, func_url in jobs:
        due = last_run is None or (now - last_run).total_seconds() >= interval_min * 60
        if not due:
            continue
        ok, info = call_function(func_url)
        cur.execute(
            "UPDATE scheduler_jobs SET last_run_at = %s, last_status = %s, last_error = %s WHERE id = %s",
            (now, 'ok' if ok else 'error', None if ok else info, job_id)
        )
        fired.append({'func_name': func_name, 'ok': ok, 'info': info})
    return fired


def json_resp(status, data, extra_headers=None):
    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    if extra_headers:
        headers.update(extra_headers)
    return {'statusCode': status, 'headers': headers, 'body': json.dumps(data)}


def handler(event: dict, context) -> dict:
    """Толкатель (планировщик): единый будильник сайта. Cron-режим (action=run с ключом) обходит расписание и вызывает функции по сроку. API-режим (для владельца) управляет расписанием и белым списком."""
    if event.get('httpMethod') == 'OPTIONS':
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

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}') if event.get('body') else {}
    action = params.get('action') or body.get('action') or ''

    conn = get_db()
    cur = conn.cursor()

    try:
        # --- Cron-режим: запуск расписания ---
        if action == 'run':
            secret = os.environ.get('SCHEDULER_SECRET', '').strip()
            given = (params.get('key') or body.get('key') or '').strip()
            if secret and given != secret:
                return json_resp(403, {'error': 'forbidden'})
            fired = run_scheduler(cur)
            conn.commit()
            return json_resp(200, {'fired': fired, 'count': len(fired)})

        # --- API-режим: только владелец ---
        req_headers = event.get('headers', {})
        auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        user = get_user_by_token(cur, token)
        if not user:
            return json_resp(401, {'error': 'Не авторизован'})
        user_id, user_role = user
        if user_role != 'owner':
            return json_resp(403, {'error': 'Только владелец'})

        if method == 'GET':
            cur.execute(
                """SELECT j.id, j.func_name, j.interval_minutes, j.enabled,
                          j.last_run_at, j.last_status, j.last_error, a.title, a.description
                   FROM scheduler_jobs j
                   JOIN scheduler_allowed a ON a.func_name = j.func_name
                   ORDER BY a.title"""
            )
            jobs = [{
                'id': r[0], 'func_name': r[1], 'interval_minutes': r[2], 'enabled': r[3],
                'last_run_at': r[4].isoformat() if r[4] else None,
                'last_status': r[5], 'last_error': r[6], 'title': r[7], 'description': r[8],
            } for r in cur.fetchall()]
            cur.execute("SELECT func_name, title, description FROM scheduler_allowed ORDER BY title")
            allowed = [{'func_name': r[0], 'title': r[1], 'description': r[2]} for r in cur.fetchall()]
            return json_resp(200, {'jobs': jobs, 'allowed': allowed})

        if method == 'POST':
            op = body.get('op', '')

            if op == 'add':
                func_name = (body.get('func_name') or '').strip()
                interval = int(body.get('interval_minutes') or 1)
                if interval < 1:
                    interval = 1
                cur.execute("SELECT 1 FROM scheduler_allowed WHERE func_name = %s", (func_name,))
                if not cur.fetchone():
                    return json_resp(400, {'error': 'Функция не в белом списке'})
                cur.execute(
                    """INSERT INTO scheduler_jobs (func_name, interval_minutes, enabled)
                       VALUES (%s, %s, true)
                       ON CONFLICT (func_name) DO UPDATE SET interval_minutes = EXCLUDED.interval_minutes, enabled = true""",
                    (func_name, interval)
                )
                conn.commit()
                return json_resp(200, {'success': True})

            if op == 'update':
                job_id = int(body.get('id'))
                fields = []
                vals = []
                if 'interval_minutes' in body:
                    iv = int(body.get('interval_minutes') or 1)
                    fields.append('interval_minutes = %s')
                    vals.append(max(1, iv))
                if 'enabled' in body:
                    fields.append('enabled = %s')
                    vals.append(bool(body.get('enabled')))
                if not fields:
                    return json_resp(400, {'error': 'Нет полей для обновления'})
                vals.append(job_id)
                cur.execute(f"UPDATE scheduler_jobs SET {', '.join(fields)} WHERE id = %s", vals)
                conn.commit()
                return json_resp(200, {'success': True})

            if op == 'delete':
                job_id = int(body.get('id'))
                cur.execute("DELETE FROM scheduler_jobs WHERE id = %s", (job_id,))
                conn.commit()
                return json_resp(200, {'success': True})

            if op == 'push_now':
                job_id = int(body.get('id'))
                cur.execute(
                    """SELECT j.func_name, a.func_url FROM scheduler_jobs j
                       JOIN scheduler_allowed a ON a.func_name = j.func_name WHERE j.id = %s""",
                    (job_id,)
                )
                row = cur.fetchone()
                if not row:
                    return json_resp(404, {'error': 'Задание не найдено'})
                ok, info = call_function(row[1])
                cur.execute(
                    "UPDATE scheduler_jobs SET last_run_at = %s, last_status = %s, last_error = %s WHERE id = %s",
                    (now_utc(), 'ok' if ok else 'error', None if ok else info, job_id)
                )
                conn.commit()
                return json_resp(200, {'success': ok, 'info': info})

            return json_resp(400, {'error': 'Неизвестная операция'})

        return json_resp(405, {'error': 'Method not allowed'})
    finally:
        cur.close()
        conn.close()