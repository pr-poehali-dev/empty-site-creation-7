import os

import psycopg2

WAREHOUSES = [
    {'key': 'wh_sgp', 'name': 'СГП'},
    {'key': 'wh_wipe', 'name': 'Протирка'},
    {'key': 'wh_repair', 'name': 'Под ремонт'},
    {'key': 'wh_scrap', 'name': 'Утиль'},
]
KEY_BY_NAME = {w['key']: w['name'] for w in WAREHOUSES}

PG = "btrim(COALESCE(product_group,''))"
PB = "btrim(COALESCE(brand,''))"
PM = "btrim(COALESCE(model,''))"
FB = "btrim(COALESCE(factory_barcode,''))"
FB2 = "btrim(COALESCE(factory_barcode_2,''))"
POS = f"({PG},{PB},{PM})"
NAME_SQL = (
    f"btrim(CASE WHEN {PG}='' THEN '' ELSE {PG} END || ' ' || "
    f"CASE WHEN {PB}='' THEN '' ELSE {PB} END || ' ' || "
    f"CASE WHEN {PM}='' THEN '' ELSE {PM} END)"
)
FREE = (
    "NOT EXISTS (SELECT 1 FROM receiving_batch_items bi "
    "WHERE bi.item_id=receiving_items.id AND bi.active)"
)


def conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def esc(s):
    return str(s).replace("'", "''")


def code_match(code):
    """Единица подходит под заводской код: он записан у неё или есть у её позиции."""
    e = esc(code)
    return (
        f"({FB}='{e}' OR {FB2}='{e}' OR {POS} IN "
        f"(SELECT product_group, brand, model FROM position_codes WHERE code='{e}'))"
    )


def pos_where(p):
    return (
        f"{PG}='{esc(p.get('product_group') or '')}' AND {PB}='{esc(p.get('brand') or '')}' "
        f"AND {PM}='{esc(p.get('model') or '')}'"
    )


def who(cur, token):
    token = (token or '').replace('Bearer ', '').strip()
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role, u.phone FROM users u JOIN user_sessions s ON s.user_id=u.id "
        f"WHERE s.token='{esc(token)}' AND s.expires_at > NOW() LIMIT 1"
    )
    u = cur.fetchone()
    if not u:
        return None
    cur.execute(
        f"SELECT id, role_id, first_name, last_name FROM managers "
        f"WHERE phone='{esc(u['phone'])}' LIMIT 1"
    )
    m = cur.fetchone()
    name = ''
    if m:
        name = ' '.join(x for x in [m['first_name'], m['last_name']] if x).strip()
    is_owner = u['role'] == 'owner'
    return {
        'user_id': int(u['id']),
        'is_owner': is_owner,
        'manager_id': m['id'] if m else None,
        'role_id': m['role_id'] if m else None,
        'name': name or ('Владелец' if is_owner else 'Сотрудник'),
    }


def perms_of(cur, actor):
    if actor['is_owner']:
        return None
    result = {}
    if actor['role_id']:
        cur.execute(
            f"SELECT perm_key, enabled FROM receiving_permissions WHERE role_id={int(actor['role_id'])}"
        )
        for r in cur.fetchall():
            result[r['perm_key']] = r['enabled']
    if actor['manager_id']:
        cur.execute(
            f"SELECT perm_key, enabled FROM receiving_permissions WHERE manager_id={int(actor['manager_id'])}"
        )
        for r in cur.fetchall():
            result[r['perm_key']] = r['enabled']
    return result


def can(actor, perms, key):
    return actor['is_owner'] or bool((perms or {}).get(key))


def allowed_warehouses(actor, perms):
    return [w['name'] for w in WAREHOUSES if can(actor, perms, w['key'])]
