"""Товар в черновике или собранной партии двигается только документом партии."""


def held_map(cur, ids):
    """{item_id: 'в партии …' / 'в черновике у …'} для занятых единиц."""
    clean = [int(i) for i in ids if str(i).lstrip('-').isdigit()]
    if not clean:
        return {}
    cur.execute(
        "SELECT bi.item_id, b.status, b.number, b.created_by_name "
        "FROM receiving_batch_items bi JOIN receiving_batches b ON b.id=bi.batch_id "
        f"WHERE bi.active AND bi.item_id IN ({','.join(str(i) for i in clean)})"
    )
    out = {}
    for r in cur.fetchall():
        if r['status'] == 'draft':
            out[int(r['item_id'])] = f"в черновике у {r['created_by_name'] or 'сотрудника'}"
        else:
            out[int(r['item_id'])] = f"в партии {r['number']}"
    return out


def held_error(cur, item_id):
    where = held_map(cur, [item_id]).get(int(item_id or 0))
    if not where:
        return None
    return f"Товар {where} — сначала заберите его из партии"
