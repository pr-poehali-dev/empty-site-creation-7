"""Сброс истории единицы: товар остаётся из файла поставщика, но как будто с ним ничего не делали."""

CLEAR = [
    'check_result', 'defect_confirmed', 'new_defect', 'new_defect_text',
    'checked_by', 'checked_by_name', 'checked_at', 'daily_receiving_id',
    'warehouse', 'has_package', 'invoice_weight',
    'wipe_result', 'wipe_look', 'wipe_traces', 'wipe_by', 'wipe_by_name',
    'wipe_at', 'wipe_local', 'wipe_receiving_id',
    'master_fixed_from', 'master_fixed_by_name', 'master_fixed_at',
    'fixed_at', 'fixed_local', 'fixed_by_name', 'wipe_fixed_at',
]


def preview(cur, item_id):
    cur.execute(
        f"SELECT id, tech_name, serial_number, supplier_barcode, check_result, warehouse, "
        f"checked_by_name, checked_at, wipe_result FROM receiving_items WHERE id={int(item_id)}"
    )
    item = cur.fetchone()
    if not item:
        return None, 'Товар не найден'
    iid = int(item_id)
    counts = {}
    for key, sql in (
        ('moves', f"SELECT COUNT(*) AS n FROM receiving_moves WHERE item_id={iid}"),
        ('fixes', f"SELECT COUNT(*) AS n FROM receiving_fixes WHERE item_id={iid}"),
        ('events', f"SELECT COUNT(*) AS n FROM receiving_work_events WHERE item_id={iid}"),
    ):
        cur.execute(sql)
        counts[key] = int(cur.fetchone()['n'])
    cur.execute(
        "SELECT b.status, b.number, b.created_by_name FROM receiving_batch_items bi "
        "JOIN receiving_batches b ON b.id=bi.batch_id "
        f"WHERE bi.active AND bi.item_id={iid} LIMIT 1"
    )
    h = cur.fetchone()
    held = None
    if h:
        held = {'status': h['status'], 'number': h['number'], 'by': h['created_by_name']}
    return {'item': dict(item), 'counts': counts, 'held': held}, None


def reset(cur, actor, item_id):
    iid = int(item_id or 0)
    if not iid:
        return None, 'Не указан товар'
    cur.execute(f"SELECT id FROM receiving_items WHERE id={iid} FOR UPDATE")
    if not cur.fetchone():
        return None, 'Товар не найден'
    cur.execute(
        "SELECT bi.id, bi.batch_id, b.status, b.number FROM receiving_batch_items bi "
        "JOIN receiving_batches b ON b.id=bi.batch_id "
        f"WHERE bi.active AND bi.item_id={iid}"
    )
    holds = cur.fetchall()
    numbered = [h for h in holds if h['status'] != 'draft']
    if numbered:
        return None, f"Товар в партии {numbered[0]['number']} — сначала уберите его из партии"
    for h in holds:
        cur.execute(f"UPDATE receiving_batch_items SET active=false WHERE id={int(h['id'])}")
        cur.execute(
            "INSERT INTO receiving_batch_log (batch_id, action, item_id, details, by_user, by_name) "
            f"VALUES ({int(h['batch_id'])}, 'reset_out', {iid}, NULL, {int(actor['user_id'])}, 'Владелец')"
        )
        cur.execute(f"UPDATE receiving_batches SET updated_at=now() WHERE id={int(h['batch_id'])}")

    cur.execute(f"DELETE FROM receiving_moves WHERE item_id={iid}")
    cur.execute(f"DELETE FROM receiving_fixes WHERE item_id={iid}")
    cur.execute(f"DELETE FROM receiving_work_events WHERE item_id={iid}")
    sets = ', '.join(f"{c}=NULL" for c in CLEAR)
    cur.execute(f"UPDATE receiving_items SET {sets} WHERE id={iid}")
    return {'ok': True, 'drafts': len(holds)}, None
