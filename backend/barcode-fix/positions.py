"""Позиция = товарная группа + бренд + модель. У позиции может быть несколько
заводских кодов — они живут в position_codes. Поле factory_barcode у единицы
остаётся «основным» кодом: его показывают экраны и по нему работает старый поиск."""

PG = "btrim(COALESCE(product_group,''))"
PB = "btrim(COALESCE(brand,''))"
PM = "btrim(COALESCE(model,''))"
FB = "btrim(COALESCE(factory_barcode,''))"
FB2 = "btrim(COALESCE(factory_barcode_2,''))"

NAME_SQL = (
    f"btrim(CASE WHEN {PG}='' THEN '' ELSE {PG} END || ' ' || "
    f"CASE WHEN {PB}='' THEN '' ELSE {PB} END || ' ' || "
    f"CASE WHEN {PM}='' THEN '' ELSE {PM} END)"
)


def esc(s):
    return str(s).replace("'", "''")


def norm_pos(p):
    p = p or {}
    return {
        'product_group': str(p.get('product_group') or '').strip(),
        'brand': str(p.get('brand') or '').strip(),
        'model': str(p.get('model') or '').strip(),
    }


def pos_empty(p):
    return not (p['product_group'] or p['brand'] or p['model'])


def pos_name(p):
    return ' '.join(x for x in [p['product_group'], p['brand'], p['model']] if x)


def pos_where(p):
    return (
        f"{PG}='{esc(p['product_group'])}' AND {PB}='{esc(p['brand'])}' "
        f"AND {PM}='{esc(p['model'])}'"
    )


def code_match(code):
    """Единица подходит под код, если код у неё записан или он есть у её позиции."""
    e = esc(code)
    return (
        f"({FB}='{e}' OR {FB2}='{e}' OR ({PG},{PB},{PM}) IN "
        f"(SELECT product_group, brand, model FROM position_codes WHERE code='{e}'))"
    )


def positions_of_code(cur, code):
    cur.execute(
        f"SELECT {PG} AS product_group, {PB} AS brand, {PM} AS model, COUNT(*) AS units "
        f"FROM receiving_items WHERE {code_match(code)} GROUP BY 1,2,3 ORDER BY units DESC"
    )
    out = []
    for r in cur.fetchall():
        p = norm_pos(r)
        p['units'] = int(r['units'])
        p['name'] = pos_name(p)
        out.append(p)
    return out


def pos_codes(cur, p):
    """Все коды позиции: из справочника и записанные у единиц (на случай ручной правки)."""
    cur.execute(
        f"SELECT code, MIN(o) AS o FROM ("
        f"SELECT code, id AS o FROM position_codes WHERE product_group='{esc(p['product_group'])}' "
        f"AND brand='{esc(p['brand'])}' AND model='{esc(p['model'])}' "
        f"UNION ALL SELECT {FB} AS code, 9223372036854775807 AS o FROM receiving_items "
        f"WHERE {pos_where(p)} AND {FB}<>'') t GROUP BY code ORDER BY o"
    )
    return [r['code'] for r in cur.fetchall()]


def ensure_code(cur, code, p, source, by_name):
    cur.execute(
        f"INSERT INTO position_codes (code, product_group, brand, model, source, created_by_name) "
        f"VALUES ('{esc(code)}', '{esc(p['product_group'])}', '{esc(p['brand'])}', "
        f"'{esc(p['model'])}', '{esc(source)}', '{esc(by_name or '')}') "
        f"ON CONFLICT DO NOTHING RETURNING id"
    )
    return cur.fetchone() is not None


def drop_code(cur, code, p):
    cur.execute(
        f"DELETE FROM position_codes WHERE code='{esc(code)}' "
        f"AND product_group='{esc(p['product_group'])}' AND brand='{esc(p['brand'])}' "
        f"AND model='{esc(p['model'])}'"
    )


def fill_items(cur, code, p):
    """Пустой основной код у единиц позиции заполняем — как делает мастер в приёмке."""
    cur.execute(
        f"UPDATE receiving_items SET factory_barcode='{esc(code)}' "
        f"WHERE {pos_where(p)} AND {FB}='' RETURNING id"
    )
    return [int(r['id']) for r in cur.fetchall()]


def pos_units(cur, p):
    cur.execute(f"SELECT COUNT(*) AS n FROM receiving_items WHERE {pos_where(p)}")
    return int(cur.fetchone()['n'])


def transfer_out(cur, code, p):
    """Код ошибочно записан у позиции — убираем его. Основным кодом единиц
    становится другой код позиции, если он есть. Возвращаем, что поставили, для отката."""
    drop_code(cur, code, p)
    rest = [c for c in pos_codes(cur, p) if c != code]
    other = rest[0] if rest else None
    value = f"'{esc(other)}'" if other else 'NULL'
    cur.execute(
        f"UPDATE receiving_items SET factory_barcode={value} "
        f"WHERE {pos_where(p)} AND {FB}='{esc(code)}' RETURNING id"
    )
    ids = [int(r['id']) for r in cur.fetchall()]
    return {str(i): other or '' for i in ids}
