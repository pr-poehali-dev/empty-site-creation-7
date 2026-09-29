import base64
import io
import json
import os
import re
from datetime import datetime, timedelta, timezone

import psycopg2
from psycopg2.extras import RealDictCursor

from builders import build_pdf, build_xlsx

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}

PERM_KEY = 'report_summary'

WAREHOUSES = ['СГП', 'Протирка', 'Под ремонт', 'Утиль']
OUTCOMES = ['sale', 'wipe', 'repair', 'scrap']

G = "COALESCE(NULLIF(btrim(product_group),''),'')"
B = "COALESCE(NULLIF(btrim(brand),''),'')"
M = "COALESCE(NULLIF(btrim(model),''),'')"
NAME_SQL = (
    f"btrim(CASE WHEN {G}='' THEN 'без группы' ELSE {G} END || ' ' || "
    f"CASE WHEN {B}='' THEN 'без бренда' ELSE {B} END || ' ' || "
    f"CASE WHEN {M}='' THEN 'без модели' ELSE {M} END)"
)
DIR_SQL = "COALESCE(NULLIF(btrim(direction),''),'Без направления')"


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json', **CORS},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _esc(s):
    return str(s).replace("'", "''")


def who(cur, token):
    token = (token or '').replace('Bearer ', '').strip()
    if not token:
        return None
    cur.execute(
        f"SELECT u.role, u.phone FROM users u JOIN user_sessions s ON s.user_id=u.id "
        f"WHERE s.token='{_esc(token)}' AND s.expires_at > NOW() LIMIT 1"
    )
    u = cur.fetchone()
    if not u:
        return None
    cur.execute(f"SELECT id, role_id FROM managers WHERE phone='{_esc(u['phone'])}' LIMIT 1")
    m = cur.fetchone()
    return {
        'is_owner': u['role'] == 'owner',
        'manager_id': m['id'] if m else None,
        'role_id': m['role_id'] if m else None,
    }


def allowed(cur, actor):
    """Владелец видит всегда. Сотрудник — по праву: личное перекрывает право роли."""
    if actor['is_owner']:
        return True
    value = False
    if actor['role_id']:
        cur.execute(
            f"SELECT enabled FROM receiving_permissions "
            f"WHERE role_id={int(actor['role_id'])} AND perm_key='{PERM_KEY}' LIMIT 1"
        )
        r = cur.fetchone()
        if r:
            value = bool(r['enabled'])
    if actor['manager_id']:
        cur.execute(
            f"SELECT enabled FROM receiving_permissions "
            f"WHERE manager_id={int(actor['manager_id'])} AND perm_key='{PERM_KEY}' LIMIT 1"
        )
        r = cur.fetchone()
        if r:
            value = bool(r['enabled'])
    return value


def _date(v):
    v = (v or '').strip()
    return v if re.fullmatch(r'\d{4}-\d{2}-\d{2}', v) else ''


def _tz(v):
    v = (v or '').strip()
    return v if re.fullmatch(r'[A-Za-z_]+(/[A-Za-z_\-+0-9]+){0,2}', v) else 'Europe/Moscow'


def period_where(params):
    """Период — в часовом поясе того, кто строит отчёт: «29 сентября» у мастера и у отчёта одно и то же."""
    date_from = _date(params.get('from'))
    date_to = _date(params.get('to'))
    tz = _tz(params.get('tz'))
    master = (params.get('master') or '').strip()
    local = f"(checked_at AT TIME ZONE '{tz}')::date"
    parts = ["check_result IS NOT NULL", "checked_at IS NOT NULL"]
    if date_from:
        parts.append(f"{local} >= '{date_from}'")
    if date_to:
        parts.append(f"{local} <= '{date_to}'")
    if master:
        parts.append(f"btrim(COALESCE(checked_by_name,''))='{_esc(master)}'")
    return ' AND '.join(parts), date_from, date_to, master


def act_masters(cur):
    cur.execute(
        "SELECT DISTINCT btrim(checked_by_name) AS n FROM receiving_items "
        "WHERE btrim(COALESCE(checked_by_name,''))<>'' ORDER BY 1"
    )
    return {'masters': [r['n'] for r in cur.fetchall()]}


def shares(counts, total):
    """Доли в целых процентах, в сумме ровно 100: лишний процент — строке
    с самым большим остатком. Ушло хоть что-то, а вышло 0% — пишем «<1%»."""
    if not total:
        return [{'key': k, 'qty': 0, 'pct': 0, 'label': '0%'} for k in counts]
    exact = {k: n * 100 / total for k, n in counts.items()}
    pct = {k: int(v) for k, v in exact.items()}
    rest = 100 - sum(pct.values())
    for k in sorted(counts, key=lambda k: exact[k] - pct[k], reverse=True)[:rest]:
        pct[k] += 1
    out = []
    for k, n in counts.items():
        label = '<1%' if n and pct[k] == 0 else f'{pct[k]}%'
        out.append({'key': k, 'qty': n, 'pct': pct[k], 'label': label})
    return out


def collect(cur, params):
    where, date_from, date_to, master = period_where(params)

    cur.execute(
        f"SELECT COALESCE(check_result,'') AS r, COUNT(*) AS n FROM receiving_items "
        f"WHERE {where} GROUP BY 1"
    )
    by = {r['r']: int(r['n']) for r in cur.fetchall()}
    total = sum(by.values())
    split = shares({o: by.get(o, 0) for o in OUTCOMES}, total)

    tech = "COALESCE(NULLIF(btrim(tech_name),''),'без наименования')"
    order = "COALESCE(NULLIF(btrim(order_number),''),'—')"
    # Дефекты — только у ремонта и как есть: подтверждённый заявленный — текст
    # поставщика, новый — текст мастера. Разные тексты — разные строки.
    confirmed = (
        "CASE WHEN check_result='repair' AND defect_confirmed IS TRUE "
        "THEN COALESCE(btrim(declared_defect),'') ELSE '' END"
    )
    new_def = (
        "CASE WHEN check_result='repair' AND new_defect IS TRUE "
        "THEN COALESCE(btrim(new_defect_text),'') ELSE '' END"
    )
    cur.execute(
        f"SELECT check_result AS outcome, {tech} AS name, {order} AS ord, "
        f"{confirmed} AS confirmed, {new_def} AS new_defect, COUNT(*) AS n "
        f"FROM receiving_items WHERE {where} GROUP BY 1,2,3,4,5"
    )
    rank = {o: i for i, o in enumerate(OUTCOMES)}
    rows = sorted(
        cur.fetchall(),
        key=lambda r: (rank.get(r['outcome'], 99), r['name'].lower(), r['ord'],
                       r['confirmed'], r['new_defect']),
    )
    checked = []
    for o in OUTCOMES:
        part = [r for r in rows if r['outcome'] == o]
        if not part:
            continue
        checked.append({
            'outcome': o,
            'qty': sum(int(r['n']) for r in part),
            'rows': [
                {'name': r['name'], 'order': r['ord'], 'qty': int(r['n']),
                 'confirmed': r['confirmed'], 'new_defect': r['new_defect']}
                for r in part
            ],
        })

    names = ','.join(f"'{_esc(w)}'" for w in WAREHOUSES)
    cur.execute(
        f"SELECT warehouse, {DIR_SQL} AS dir, {NAME_SQL} AS name, COUNT(*) AS n "
        f"FROM receiving_items WHERE warehouse IN ({names}) GROUP BY 1,2,3"
    )
    stock = {w: {} for w in WAREHOUSES}
    for r in cur.fetchall():
        stock[r['warehouse']].setdefault(r['dir'], []).append((r['name'], int(r['n'])))

    warehouses = []
    for w in WAREHOUSES:
        dirs = []
        for d in sorted(stock[w], key=lambda x: (x == 'Без направления', x.lower())):
            items = sorted(stock[w][d], key=lambda x: x[0].lower())
            dirs.append({'name': d, 'qty': sum(n for _, n in items), 'items': items})
        warehouses.append({'name': w, 'qty': sum(d['qty'] for d in dirs), 'dirs': dirs})

    return {
        'date_from': date_from,
        'date_to': date_to,
        'master': master,
        'total': total,
        'split': split,
        'checked': checked,
        'warehouses': warehouses,
    }


def _ru(d):
    return datetime.strptime(d, '%Y-%m-%d').strftime('%d.%m.%Y') if d else ''


def handler(event: dict, context) -> dict:
    """Отчёты приёмки: сводка проверенного товара за период (по мастеру или всем) и актуальное содержание складов — файлом Excel или PDF."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Authorization') or headers.get('x-authorization') or ''
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'receiving-reports'})

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            actor = who(cur, token)
            if not actor:
                return _resp(401, {'error': 'Войдите заново'})
            if not allowed(cur, actor):
                return _resp(403, {'error': 'Отчёт вам не открыт'})

            if action == 'access':
                return _resp(200, {'ok': True})
            if action == 'masters':
                return _resp(200, act_masters(cur))
            if action == 'summary':
                fmt = params.get('format') or 'xlsx'
                if fmt not in ('xlsx', 'pdf'):
                    return _resp(400, {'error': 'Неизвестный формат'})
                data = collect(cur, params)
    finally:
        conn.close()

    if action != 'summary':
        return _resp(400, {'error': 'Неизвестное действие'})

    tz_offset = int(params.get('offset') or 180)
    now = datetime.now(timezone.utc) + timedelta(minutes=tz_offset)
    period = f"{_ru(data['date_from']) or 'начало'} — {_ru(data['date_to']) or 'сегодня'}"
    meta = {
        'period': period,
        'master': data['master'] or 'Все мастера',
        'made': now.strftime('%d.%m.%Y %H:%M'),
    }
    if fmt == 'xlsx':
        raw = build_xlsx(data, meta)
    else:
        raw = build_pdf(data, meta)
    stamp = now.strftime('%Y-%m-%d')
    return _resp(200, {
        'file': base64.b64encode(raw).decode(),
        'filename': f'Сводка_приёмки_{stamp}.{fmt}',
    })
