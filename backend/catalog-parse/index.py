"""Загрузка каталога поставщика: разбор файла, отсев аксессуаров, сверка и запись товаров."""
import base64
import json
import os

import psycopg2
from psycopg2.extras import RealDictCursor

from parser import parse_catalog, convert_article, PRICE_FIELDS
import catalog_match
import prices
from matcher import build_report, barcode_report, norm_article, match_items, item_codes, list_row, resolve

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token, X-Session-Id',
    'Access-Control-Max-Age': '86400',
}

OUR_PRICE_COLS = ['price_base', 'price_retail', 'price_wholesale', 'price_purchase']


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json', **CORS},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def list_folders():
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            """SELECT product_group, max(product_group_id), count(*) FROM products
               WHERE product_group IS NOT NULL AND product_group <> ''
               GROUP BY product_group ORDER BY lower(product_group)"""
        )
        return [{'name': r[0], 'id': r[1], 'products': r[2]} for r in cur.fetchall()]


def brand_groups(draft_id, excluded, article_case):
    """Бренды из файла с числом товаров и подставленной группой каталога."""
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    items = apply_filters(d['rows_data'] or [], excluded, article_case)
    counts = {}
    for it in items:
        b = ' '.join(str(it.get('brand') or '').split())
        counts[b] = counts.get(b, 0) + 1
    folders = list_folders()
    by_norm = {_norm_folder(f['name']): f['name'] for f in folders}
    with _conn() as c, c.cursor() as cur:
        cur.execute("SELECT name, product_group FROM brands WHERE product_group IS NOT NULL AND product_group <> ''")
        saved = {_norm_folder(n): g for n, g in cur.fetchall()}
    out = []
    for b, n in sorted(counts.items(), key=lambda x: (x[0] == '', x[0].lower())):
        group, source = '', ''
        if b and saved.get(_norm_folder(b)):
            group, source = saved[_norm_folder(b)], 'saved'
        elif b and by_norm.get(_norm_folder(b)):
            group, source = by_norm[_norm_folder(b)], 'auto'
        elif not b and saved.get(''):
            group, source = saved[''], 'saved'
        out.append({'brand': b, 'count': n, 'group': group, 'source': source})
    return {'brands': out, 'has_brand': any(b for b in counts)}, None


def save_brand_groups(cur, mapping):
    for b, g in mapping.items():
        g = ' '.join(str(g or '').split())
        b = ' '.join(str(b or '').split())
        if not g or not b:
            continue
        cur.execute("SELECT id FROM brands WHERE lower(name) = lower(%s) LIMIT 1", (b,))
        row = cur.fetchone()
        if row:
            cur.execute("UPDATE brands SET product_group = %s WHERE id = %s", (g, row[0]))
        else:
            cur.execute("INSERT INTO brands (name, product_group) VALUES (%s, %s) ON CONFLICT (name) DO UPDATE "
                        "SET product_group = EXCLUDED.product_group", (b, g))


NAME_MAX = 100


def rename_items(draft_id, names):
    """Сохраняет исправленные наименования в черновике: {номер строки: новое наименование}."""
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    fix = {str(k): ' '.join(str(v or '').split()) for k, v in (names or {}).items()}
    rows = d['rows_data'] or []
    changed = 0
    for it in rows:
        v = fix.get(str(it.get('row')))
        if v and v != it.get('name'):
            it['name'] = v
            changed += 1
    if changed:
        with _conn() as c, c.cursor() as cur:
            cur.execute("UPDATE catalog_drafts SET rows_data = %s WHERE id = %s",
                        (json.dumps(rows, ensure_ascii=False), draft_id))
    return {'changed': changed}, None


def _norm_folder(s):
    return ' '.join(str(s or '').split()).lower()


def _esc(s):
    return str(s).replace("'", "''")


def _is_owner(cur, token):
    if not token:
        return False
    cur.execute(
        "SELECT u.role FROM users u JOIN user_sessions s ON s.user_id = u.id "
        "WHERE s.token = %s AND s.expires_at > NOW()",
        (token,)
    )
    row = cur.fetchone()
    return bool(row) and row[0] == 'owner'


def list_suppliers():
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT s.id, s.name, "
            "(SELECT COUNT(*) FROM catalog_layouts l WHERE l.supplier_id = s.id) AS layouts "
            "FROM catalog_suppliers s ORDER BY s.name"
        )
        return [dict(r) for r in cur.fetchall()]


def create_supplier(name):
    name = (name or '').strip()
    if not name:
        return None, 'Укажите название поставщика'
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM catalog_suppliers WHERE lower(name) = lower(%s)", (name,))
        row = cur.fetchone()
        if row:
            return dict(row), None
        cur.execute(
            "INSERT INTO catalog_suppliers (name) VALUES (%s) RETURNING id, name", (name,)
        )
        return dict(cur.fetchone()), None


def find_layout(supplier_id, signature):
    if not supplier_id or not signature:
        return None
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT mapping, price_mapping, excluded_categories, article_case, red_suffix "
            "FROM catalog_layouts WHERE supplier_id = %s AND header_signature = %s",
            (supplier_id, signature)
        )
        row = cur.fetchone()
        return dict(row) if row else None


def save_layout(supplier_id, signature, mapping, price_mapping, excluded, article_case, red_suffix=False):
    if not supplier_id or not signature:
        return
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            "INSERT INTO catalog_layouts "
            "(supplier_id, header_signature, mapping, price_mapping, excluded_categories, article_case, red_suffix) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (supplier_id, header_signature) DO UPDATE SET "
            "mapping = EXCLUDED.mapping, price_mapping = EXCLUDED.price_mapping, "
            "excluded_categories = EXCLUDED.excluded_categories, "
            "article_case = EXCLUDED.article_case, red_suffix = EXCLUDED.red_suffix, "
            "used_count = catalog_layouts.used_count + 1, last_used_at = NOW()",
            (supplier_id, signature, json.dumps(mapping),
             json.dumps(price_mapping or {}), json.dumps(excluded or []), article_case, bool(red_suffix))
        )


def _purge(cur):
    cur.execute("DELETE FROM catalog_drafts WHERE expires_at < NOW()")


def save_draft(supplier_id, file_name, data, draft_id=None):
    with _conn() as c, c.cursor() as cur:
        _purge(cur)
        payload = json.dumps(data.get('items') or [], ensure_ascii=False)
        if draft_id:
            cur.execute(
                "UPDATE catalog_drafts SET supplier_id = %s, file_name = %s, mapping = %s, "
                "price_mapping = %s, excluded_categories = %s, article_case = %s, "
                "vat_rate = %s, product_group = %s, fill_mode = %s, header_signature = %s, "
                "rows_data = %s, rows_count = %s WHERE id = %s RETURNING id",
                (supplier_id, file_name, json.dumps(data.get('mapping') or {}),
                 json.dumps(data.get('price_mapping') or {}),
                 json.dumps(data.get('excluded_categories') or []),
                 data.get('article_case'), data.get('vat_rate'), data.get('product_group'),
                 data.get('fill_mode') or 'empty_only', data.get('header_signature'), payload,
                 len(data.get('items') or []), draft_id)
            )
            row = cur.fetchone()
            if row:
                return row[0]
        cur.execute(
            "INSERT INTO catalog_drafts (supplier_id, file_name, mapping, price_mapping, "
            "excluded_categories, article_case, vat_rate, product_group, fill_mode, "
            "header_signature, rows_data, rows_count) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (supplier_id, file_name, json.dumps(data.get('mapping') or {}),
             json.dumps(data.get('price_mapping') or {}),
             json.dumps(data.get('excluded_categories') or []),
             data.get('article_case'), data.get('vat_rate'), data.get('product_group'),
             data.get('fill_mode') or 'empty_only', data.get('header_signature'),
             payload, len(data.get('items') or []))
        )
        return cur.fetchone()[0]


def get_draft(draft_id):
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        _purge(cur)
        cur.execute(
            "SELECT d.*, s.name AS supplier_name FROM catalog_drafts d "
            "LEFT JOIN catalog_suppliers s ON s.id = d.supplier_id WHERE d.id = %s",
            (draft_id,)
        )
        row = cur.fetchone()
        return dict(row) if row else None


def list_drafts():
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        _purge(cur)
        cur.execute(
            "SELECT d.id, d.file_name, d.rows_count, d.stage, d.created_at, "
            "s.name AS supplier_name FROM catalog_drafts d "
            "LEFT JOIN catalog_suppliers s ON s.id = d.supplier_id "
            "ORDER BY d.created_at DESC LIMIT 20"
        )
        return [dict(r) for r in cur.fetchall()]


def drop_draft(draft_id):
    with _conn() as c, c.cursor() as cur:
        cur.execute("DELETE FROM catalog_drafts WHERE id = %s", (draft_id,))


RED_BRAND = 'red solution'
RED_SUFFIX = '(RED)'


def is_red(it):
    """Товар бренда RED SOLUTION: по колонке «Бренд», а без неё — по наименованию."""
    b = ' '.join(str(it.get('brand') or '').split()).lower()
    if b:
        return b == RED_BRAND
    return RED_BRAND in ' '.join(str(it.get('name') or '').split()).lower()


def red_article(a):
    a = ' '.join(str(a or '').split())
    if not a or a.upper().replace(' ', '').endswith(RED_SUFFIX):
        return a
    return a + ' ' + RED_SUFFIX


def apply_filters(items, excluded, article_case, red=False):
    """Отсев по категориям, приведение артикулов и суффикс (RED) для RED SOLUTION."""
    ex = set(excluded or [])
    out = []
    for it in items:
        if (it.get('category') or '—') in ex:
            continue
        row = dict(it)
        row['article'] = convert_article(row.get('article'), article_case or 'as_is')
        if red and is_red(row):
            row['article'] = red_article(row['article'])
        out.append(row)
    return out


def group_opts(src):
    """Режим групп из параметров экрана: одна группа или по брендам."""
    src = src or {}
    mode = 'brand' if src.get('group_mode') == 'brand' else 'single'
    return {
        'mode': mode,
        'red_suffix': bool(src.get('red_suffix')),
        'product_group': None if mode == 'brand' else (' '.join(str(src.get('product_group') or '').split()) or None),
        'brand_groups': (src.get('brand_groups') or {}) if mode == 'brand' else {},
    }


def _same_opts(a, b):
    return json.dumps(a or {}, sort_keys=True, ensure_ascii=False) == json.dumps(b or {}, sort_keys=True, ensure_ascii=False)


def preview(draft_id, excluded, article_case, opts=None):
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    g = group_opts(opts)
    items = apply_filters(d['rows_data'] or [], excluded, article_case, g['red_suffix'])
    decisions = d.get('group_decisions') or {}
    with _conn() as c, c.cursor() as cur:
        cur.execute("UPDATE catalog_drafts SET group_opts = %s WHERE id = %s",
                    (json.dumps(g, ensure_ascii=False), draft_id))
        report, _ = build_report(cur, items, g, decisions)
        kept = {it['row'] for it in items}
        dropped = [dict(it, article=red_article(convert_article(it.get('article'), article_case or 'as_is'))
                        if g['red_suffix'] and is_red(it)
                        else convert_article(it.get('article'), article_case or 'as_is'))
                   for it in (d['rows_data'] or []) if it['row'] not in kept]
        drop_map, _ = match_items(cur, dropped)
    report['excluded_items'] = [dict(list_row(it), in_catalog=it['row'] in drop_map) for it in dropped]
    report['excluded_count'] = len(d['rows_data'] or []) - len(items)
    report['excluded_existing'] = len(drop_map)
    return report, None


def decide(draft_id, decisions):
    """Сохраняет решения по товарам, найденным в другой группе: {строка: {action, product_id}}."""
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    cur_dec = d.get('group_decisions') or {}
    for k, v in (decisions or {}).items():
        act = (v or {}).get('action')
        if act in ('update', 'move', 'new', 'skip'):
            cur_dec[str(k)] = {'action': act, 'product_id': (v or {}).get('product_id')}
        else:
            cur_dec.pop(str(k), None)
    with _conn() as c, c.cursor() as cur:
        cur.execute("UPDATE catalog_drafts SET group_decisions = %s WHERE id = %s",
                    (json.dumps(cur_dec, ensure_ascii=False), draft_id))
    return {'saved': len(decisions or {})}, None


def _price_values(item, price_mapping):
    """Раскладка цен файла по нашим четырём полям."""
    vals = {}
    for col in OUR_PRICE_COLS:
        src = (price_mapping or {}).get(col)
        vals[col] = item.get(src) if src in PRICE_FIELDS else None
    return vals


def _sql_val(v):
    if v is None or v == '':
        return 'NULL'
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return str(v)
    return "'" + _esc(v) + "'"


COMMIT_CHUNK = 100


def _folder_of(cur, cache, name):
    """Точное имя и id папки каталога по названию группы."""
    if not cache:
        cur.execute("SELECT product_group, max(product_group_id) FROM products "
                    "WHERE product_group IS NOT NULL AND product_group <> '' GROUP BY product_group")
        for n, gid in cur.fetchall():
            cache[_norm_folder(n)] = (n, gid)
    return cache.get(_norm_folder(name), (name, None))


def commit(draft_id, opts):
    """Записывает одну порцию товаров. Возвращает прогресс."""
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'

    excluded = opts.get('excluded_categories', d.get('excluded_categories') or [])
    article_case = opts.get('article_case') or d.get('article_case') or 'as_is'
    price_mapping = opts.get('price_mapping') or d.get('price_mapping') or {}
    vat_rate = opts.get('vat_rate') or d.get('vat_rate')
    product_group = ' '.join(str(opts.get('product_group') or d.get('product_group') or '').split()) or None
    product_group_id = None
    group_mode = opts.get('group_mode') or 'single'
    brand_map = {' '.join(str(k or '').split()).lower(): ' '.join(str(v or '').split())
                 for k, v in (opts.get('brand_groups') or {}).items()}
    fill_mode = opts.get('fill_mode') or 'empty_only'
    fill_fields = set(opts.get('fill_fields') or [])
    offset = max(int(opts.get('offset') or 0), 0)
    limit = min(max(int(opts.get('limit') or COMMIT_CHUNK), 1), 300)

    gopts = group_opts(opts)
    all_items = apply_filters(d['rows_data'] or [], excluded, article_case, gopts['red_suffix'])
    decisions = d.get('group_decisions') or {}
    if not _same_opts(gopts, d.get('group_opts')):
        return None, 'Группы изменились после сверки — нажмите «Пересверить»'
    if offset == 0:
        with _conn() as c, c.cursor() as cur:
            res0 = resolve(cur, all_items, gopts, decisions)
        if res0['undecided']:
            return None, f'Нужно решение по товарам из другой группы: {res0["undecided"]}'
        rm = res0['row_map']
        long_new = [it for it in all_items if it['row'] not in rm and it['row'] not in res0['skip']
                    and len((it.get('name') or '').strip()) > NAME_MAX]
        if long_new:
            return None, f'Наименование длиннее {NAME_MAX} знаков у {len(long_new)} новых товаров — сократите их'
    total = len(all_items)
    items = all_items[offset:offset + limit]

    created = updated = 0
    with _conn() as c, c.cursor() as cur:
        res = resolve(cur, all_items, gopts, decisions)
        row_map, skip_rows, moves = res['row_map'], res['skip'], res['moves']
        folder_ids = {}
        if group_mode == 'brand':
            cur.execute(
                "SELECT product_group, max(product_group_id) FROM products "
                "WHERE product_group IS NOT NULL AND product_group <> '' GROUP BY product_group"
            )
            for name, gid in cur.fetchall():
                folder_ids[_norm_folder(name)] = (name, gid)
        if product_group and group_mode != 'brand':
            cur.execute(
                "SELECT product_group, max(product_group_id) FROM products "
                "WHERE product_group IS NOT NULL AND product_group <> '' GROUP BY product_group"
            )
            for name, gid in cur.fetchall():
                if _norm_folder(name) == _norm_folder(product_group):
                    product_group, product_group_id = name, gid
                    break

        cur.execute("SELECT id FROM categories WHERE name = 'Без категории' AND parent_id IS NULL LIMIT 1")
        row = cur.fetchone()
        if row:
            default_cat = row[0]
        else:
            cur.execute("INSERT INTO categories (parent_id, name, sort_order) "
                        "VALUES (NULL, 'Без категории', 9999) RETURNING id")
            default_cat = cur.fetchone()[0]

        updates = []
        new_items = []
        item_pid = {}
        created_rows = {}
        for idx, it in enumerate(items):
            if it['row'] in skip_rows:
                continue
            existing = row_map.get(it['row'])
            if not existing:
                new_items.append((idx, it))
                continue
            item_pid[idx] = existing['id']
            if fill_mode == 'skip':
                mg = moves.get(existing['id'])
                if mg:
                    mname, mid = _folder_of(cur, folder_ids, mg)
                    updates.append("UPDATE products SET product_group = " + _sql_val(mname)
                                   + ", product_group_id = " + _sql_val(mid)
                                   + ", updated_at = NOW() WHERE id = " + str(int(existing['id'])))
                continue
            sets = []
            overwrite = fill_mode == 'overwrite'
            for src, col in [('tnved', 'tnved_code'), ('weight_gross', 'weight_gross'),
                             ('weight_net', 'weight_net')]:
                if src not in fill_fields:
                    continue
                val = it.get(src)
                if val in (None, ''):
                    continue
                if overwrite:
                    sets.append(col + " = " + _sql_val(val))
                else:
                    sets.append(col + " = COALESCE(" + col + ", " + _sql_val(val) + ")")
            if overwrite:
                if vat_rate:
                    sets.append("vat_rate = " + _sql_val(vat_rate))
            elif vat_rate:
                sets.append("vat_rate = COALESCE(vat_rate, " + _sql_val(vat_rate) + ")")
            mg = moves.get(existing['id'])
            if mg:
                mname, mid = _folder_of(cur, folder_ids, mg)
                sets.append("product_group = " + _sql_val(mname))
                sets.append("product_group_id = " + _sql_val(mid))
            if sets:
                updates.append("UPDATE products SET " + ', '.join(sets)
                               + ", updated_at = NOW() WHERE id = " + str(int(existing['id'])))
        if updates:
            cur.execute(';\n'.join(updates))
            updated = len(updates)

        if new_items:
            rows_sql = []
            for _, it in new_items:
                prices = _price_values(it, price_mapping)
                pg, pgid = product_group, product_group_id
                if group_mode == 'brand':
                    g = brand_map.get(' '.join(str(it.get('brand') or '').split()).lower()) or 'Общая'
                    pg, pgid = folder_ids.get(_norm_folder(g), (g, None))
                rows_sql.append('(' + ', '.join([
                    str(int(default_cat)), _sql_val(it['name']), _sql_val(it.get('article')),
                    _sql_val(it.get('brand')), _sql_val(pg), _sql_val(pgid),
                    _sql_val(prices['price_base']), _sql_val(prices['price_retail']),
                    _sql_val(prices['price_wholesale']), _sql_val(prices['price_purchase']),
                    _sql_val(vat_rate), _sql_val(it.get('weight_gross')), _sql_val(it.get('weight_net')),
                    _sql_val(it.get('tnved')), 'TRUE',
                ]) + ')')
            cur.execute(
                "INSERT INTO products (category_id, name, article, brand, product_group, product_group_id, "
                "price_base, price_retail, price_wholesale, price_purchase, "
                "vat_rate, weight_gross, weight_net, tnved_code, is_new) VALUES "
                + ',\n'.join(rows_sql) + " RETURNING id"
            )
            ids = [r[0] for r in cur.fetchall()]
            for (idx, _), pid in zip(new_items, ids):
                item_pid[idx] = pid
            created = len(ids)

            for (_, it), pid in zip(new_items, ids):
                created_rows[str(it['row'])] = pid

            brands = sorted({it['brand'] for _, it in new_items if it.get('brand')})
            if brands:
                cur.execute("INSERT INTO brands (name) VALUES "
                            + ', '.join('(' + _sql_val(b) + ')' for b in brands)
                            + " ON CONFLICT (name) DO NOTHING")


        chunk_map = {}
        for idx, it in enumerate(items):
            pid = item_pid.get(idx)
            if pid:
                chunk_map[str(it['row'])] = {'id': int(pid), 'created': str(it['row']) in created_rows}
        if offset == 0:
            cur.execute("UPDATE catalog_drafts SET row_products = %s WHERE id = %s",
                        (json.dumps(chunk_map), draft_id))
        elif chunk_map:
            cur.execute("UPDATE catalog_drafts SET row_products = COALESCE(row_products, '{}'::jsonb) || %s::jsonb "
                        "WHERE id = %s", (json.dumps(chunk_map), draft_id))

    done = min(offset + limit, total)
    finished = done >= total
    if finished:
        if group_mode == 'brand' and opts.get('brand_groups'):
            with _conn() as c, c.cursor() as cur:
                save_brand_groups(cur, opts.get('brand_groups'))
        sig = opts.get('header_signature') or d.get('header_signature')
        if sig:
            save_layout(d['supplier_id'], sig, d['mapping'], price_mapping, excluded, article_case,
                        gopts['red_suffix'])
        with _conn() as c, c.cursor() as cur:
            cur.execute(
                "UPDATE catalog_drafts SET stage = 'products_done', excluded_categories = %s, "
                "article_case = %s, expires_at = NOW() + INTERVAL '7 days' WHERE id = %s",
                (json.dumps(list(excluded)), article_case, draft_id)
            )
    return {'created': created, 'updated': updated,
            'done': done, 'total': total, 'finished': finished,
            'excluded': len(d['rows_data'] or []) - total}, None


def _draft_items(d):
    return apply_filters(d['rows_data'] or [], d.get('excluded_categories') or [],
                         d.get('article_case') or 'as_is', bool((d.get('group_opts') or {}).get('red_suffix')))


def _fixed_map(cur, d):
    """Сопоставление строк, зафиксированное при записи товаров: строка -> карточка. None — старый черновик."""
    rp = d.get('row_products')
    if rp is None:
        return None
    ids = sorted({int(v['id']) for v in rp.values()})
    names = {}
    if ids:
        cur.execute("SELECT id, article, name FROM products WHERE id IN (" + ','.join(map(str, ids)) + ")")
        names = {r[0]: (r[1] or '', r[2] or '') for r in cur.fetchall()}
    out = {}
    for k, v in rp.items():
        pid = int(v['id'])
        a, n = names.get(pid, ('', ''))
        out[int(k)] = {'id': pid, 'article': a, 'name': n}
    return out


def prices_preview(draft_id):
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    if d.get('row_products') is None:
        return None, 'Сначала загрузите товары'
    with _conn() as c, c.cursor() as cur:
        return prices.preview(cur, d, _draft_items(d)), None


def prices_apply(draft_id, field, items, settings):
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    with _conn() as c, c.cursor() as cur:
        return prices.apply(cur, d, field, items, settings)


def prices_revert(draft_id):
    with _conn() as c, c.cursor() as cur:
        return prices.revert(cur, draft_id)


def finish_draft(draft_id):
    with _conn() as c, c.cursor() as cur:
        cur.execute("UPDATE catalog_drafts SET stage = 'done', expires_at = NOW() + INTERVAL '1 day' WHERE id = %s",
                    (draft_id,))
    return {'ok': True}, None


def barcodes_preview(draft_id):
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    with _conn() as c, c.cursor() as cur:
        rep = barcode_report(cur, _draft_items(d), d.get('group_opts'), d.get('group_decisions') or {},
                             _fixed_map(cur, d))
    rep['file_name'] = d.get('file_name')
    rep['supplier_name'] = d.get('supplier_name')
    return rep, None


def barcodes_commit(draft_id, opts):
    """Записывает свободные штрихкоды одной порции товаров. Занятые не трогает."""
    d = get_draft(draft_id)
    if not d:
        return None, 'Черновик истёк'
    offset = max(int(opts.get('offset') or 0), 0)
    limit = min(max(int(opts.get('limit') or 300), 1), 500)
    all_items = _draft_items(d)
    total = len(all_items)
    items = all_items[offset:offset + limit]
    added = tried = 0
    with _conn() as c, c.cursor() as cur:
        row_map = _fixed_map(cur, d)
        if row_map is None:
            res = resolve(cur, all_items, d.get('group_opts'), d.get('group_decisions') or {})
            row_map = res['row_map']
            items = [it for it in items if it['row'] not in res['skip']]
        earlier = set()
        for it in all_items[:offset]:
            earlier.update(item_codes(it))
        seen = set(earlier)
        pairs = []
        for it in items:
            p = row_map.get(it['row'])
            if not p:
                continue
            for bc in item_codes(it):
                if bc not in seen:
                    seen.add(bc)
                    pairs.append('(' + str(int(p['id'])) + ', ' + _sql_val(bc[:100]) + ')')
        tried = len(pairs)
        if pairs:
            cur.execute(
                "INSERT INTO product_barcodes (product_id, barcode) "
                "SELECT v.pid, v.bc FROM (VALUES " + ', '.join(pairs) + ") AS v(pid, bc) "
                "WHERE NOT EXISTS (SELECT 1 FROM product_barcodes b WHERE b.barcode = v.bc)"
            )
            added = cur.rowcount
    done = min(offset + limit, total)
    finished = done >= total
    if finished:
        with _conn() as c, c.cursor() as cur:
            cur.execute("UPDATE catalog_drafts SET stage = 'barcodes_done', expires_at = NOW() + INTERVAL '7 days' "
                        "WHERE id = %s", (draft_id,))
    return {'added': added, 'skipped': tried - added, 'done': done, 'total': total,
            'finished': finished}, None


def handler(event, context):
    """Загрузка каталога поставщика: разбор Excel, отсев аксессуаров, сверка с номенклатурой."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'isBase64Encoded': False, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    if method == 'GET' and not action:
        return _resp(200, {'status': 'ok', 'service': 'catalog-parse'})

    with _conn() as c, c.cursor() as cur:
        if not _is_owner(cur, token):
            return _resp(403, {'error': 'Доступно только владельцу'})

    if method == 'GET':
        if action == 'suppliers':
            return _resp(200, {'suppliers': list_suppliers()})
        if action == 'folders':
            return _resp(200, {'folders': list_folders()})
        if action == 'drafts':
            return _resp(200, {'drafts': list_drafts()})
        if action == 'draft':
            did = params.get('id')
            if not did:
                return _resp(400, {'error': 'Не указан черновик'})
            d = get_draft(did)
            if not d:
                return _resp(404, {'error': 'Черновик истёк'})
            return _resp(200, {'draft': d})
        return _resp(400, {'error': 'Неизвестное действие'})

    if method != 'POST':
        return _resp(405, {'error': 'Метод не поддерживается'})

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Некорректный запрос'})

    action = body.get('action') or action

    if action == 'create_supplier':
        sup, err = create_supplier(body.get('name'))
        if err:
            return _resp(400, {'error': err})
        return _resp(200, {'supplier': sup})

    if action == 'parse':
        file_b64 = body.get('file')
        if not file_b64:
            return _resp(400, {'error': 'Не передан файл'})
        try:
            data = base64.b64decode(file_b64)
        except Exception:
            return _resp(400, {'error': 'Файл не читается'})
        result = parse_catalog(data, body.get('file_name'), body.get('mapping'))
        if result.get('error'):
            return _resp(400, result)
        supplier_id = body.get('supplier_id')
        saved = find_layout(supplier_id, result['header_signature'])
        if saved and not body.get('mapping'):
            result = parse_catalog(data, body.get('file_name'), saved['mapping'])
            result['price_mapping'] = saved.get('price_mapping') or {}
            result['excluded_categories'] = saved.get('excluded_categories') or []
            result['article_case'] = saved.get('article_case')
            result['red_suffix'] = bool(saved.get('red_suffix'))
            result['layout_reused'] = True
        result['red_count'] = sum(1 for it in (result.get('items') or []) if is_red(it))
        draft_id = save_draft(supplier_id, body.get('file_name'), result, body.get('draft_id'))
        result['draft_id'] = draft_id
        result.pop('items', None)
        return _resp(200, result)

    if action == 'preview':
        rep, err = preview(body.get('draft_id'), body.get('excluded_categories'),
                           body.get('article_case'), body)
        if err:
            return _resp(404, {'error': err})
        return _resp(200, {'report': rep})

    if action == 'group_decide':
        res, err = decide(body.get('draft_id'), body.get('decisions'))
        if err:
            return _resp(404, {'error': err})
        return _resp(200, res)

    if action == 'catalog_match':
        with _conn() as c, c.cursor() as cur:
            res, err = catalog_match.match(cur, body.get('items') or [], body.get('fields'))
        if err:
            return _resp(400, {'error': err})
        return _resp(200, res)

    if action == 'rename_items':
        res, err = rename_items(body.get('draft_id'), body.get('names'))
        if err:
            return _resp(404, {'error': err})
        return _resp(200, res)

    if action == 'brand_groups':
        res, err = brand_groups(body.get('draft_id'), body.get('excluded_categories'), body.get('article_case'))
        if err:
            return _resp(404, {'error': err})
        return _resp(200, res)

    if action == 'commit':
        res, err = commit(body.get('draft_id'), body)
        if err:
            return _resp(400 if 'Наименование' in err else 404, {'error': err})
        return _resp(200, {'result': res})

    if action == 'barcodes_preview':
        rep, err = barcodes_preview(body.get('draft_id'))
        if err:
            return _resp(404, {'error': err})
        return _resp(200, {'report': rep})

    if action == 'barcodes_commit':
        res, err = barcodes_commit(body.get('draft_id'), body)
        if err:
            return _resp(404, {'error': err})
        return _resp(200, {'result': res})

    if action == 'prices_preview':
        res, err = prices_preview(body.get('draft_id'))
        return _resp(404 if err else 200, {'error': err} if err else res)

    if action == 'prices_apply':
        res, err = prices_apply(body.get('draft_id'), body.get('price_field'), body.get('items'), body.get('settings'))
        return _resp(400 if err else 200, {'error': err} if err else res)

    if action == 'prices_revert':
        res, err = prices_revert(body.get('draft_id'))
        return _resp(200, res)

    if action == 'finish_draft':
        res, err = finish_draft(body.get('draft_id'))
        return _resp(200, res)

    if action == 'drop_draft':
        drop_draft(body.get('draft_id'))
        return _resp(200, {'ok': True})

    return _resp(400, {'error': 'Неизвестное действие'})