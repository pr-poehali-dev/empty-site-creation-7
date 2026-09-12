import re

SYN = {
    'article': ['артикул', 'код', 'арт', 'арт.', 'код товара', 'номенклатура код'],
    'barcode': ['штрихкод', 'штрих-код', 'шк', 'ean', 'штрих код'],
    'name': ['товары (работы, услуги)', 'товар', 'наименование', 'номенклатура',
             'товары', 'наименование товара', 'описание'],
    'qty': ['количество', 'кол-во', 'колво', 'кол'],
    'unit': ['ед.', 'ед', 'единица', 'ед.изм.', 'ед. изм.', 'единица измерения'],
    'price': ['цена'],
    'total': ['сумма', 'всего', 'итого', 'стоимость', 'сумма с ндс'],
    'num': ['№', 'n', 'no', '№ п/п', 'п/п', '#'],
}

SKIP_HEAD = ['сумма ндс', 'ставка ндс', 'ндс', '% ндс']

FIELD_TITLES = {
    'num': '№', 'article': 'Артикул', 'barcode': 'Штрихкод', 'name': 'Наименование',
    'qty': 'Количество', 'unit': 'Ед.изм.', 'price': 'Цена', 'total': 'Сумма',
}


def norm(s):
    if s is None:
        return ''
    s = str(s).replace('\xa0', ' ').replace('\u2007', ' ').replace('\u202f', ' ')
    s = s.replace('\n', ' ').replace('\r', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def nkey(s):
    return norm(s).lower().rstrip(':').strip()


def detect_col(title):
    t = nkey(title)
    if not t:
        return None
    for bad in SKIP_HEAD:
        if t == bad or t.startswith(bad):
            return None
    for field, variants in SYN.items():
        if t in variants:
            return field
    for field, variants in SYN.items():
        for v in variants:
            if len(v) >= 4 and (t.startswith(v) or v in t):
                return field
    return None


def score_header(row):
    hits, mapping = 0, {}
    for idx, cell in enumerate(row):
        f = detect_col(cell)
        if f and f not in mapping:
            mapping[f] = idx
            hits += 1
    if 'name' not in mapping:
        return 0, {}
    if not ({'qty', 'price', 'total'} & set(mapping)):
        return 0, {}
    return hits, mapping


def find_header(rows, limit=60):
    best = (0, {}, -1)
    for i, row in enumerate(rows[:limit]):
        sc, mp = score_header(row)
        if sc > best[0]:
            best = (sc, mp, i)
    return best[2], best[1]


def to_num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = norm(v).replace(' ', '')
    s = s.replace(',', '.')
    s = re.sub(r'[^0-9.\-]', '', s)
    if not s or s in ('-', '.'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def clean_code(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = norm(v)
    if re.fullmatch(r'\d+\.0+', s):
        return s.split('.')[0]
    if re.fullmatch(r'\d+(\.\d+)?[eE]\+?\d+', s):
        try:
            return str(int(float(s)))
        except ValueError:
            return s
    return s


ART_RX = [
    re.compile(r'\b([А-ЯA-Z]{2,4}-\d{2,6}(?:-{1,2}[\dA-Za-zА-Яа-я]{1,6})?)\b'),
    re.compile(r'\b([A-ZА-Я]{2,}\d{3,})\b'),
]


def art_from_name(name):
    s = norm(name)
    for rx in ART_RX:
        m = rx.findall(s)
        if m:
            return m[-1]
    return ''


STOP_RX = re.compile(
    r'^(итого|всего|в том числе|сумма прописью|без налога|ндс|руководител|бухгалтер|подпис)', re.I)


def split_qty_unit(v):
    s = norm(v)
    m = re.match(r'^([\d\s.,]+)\s*([а-яa-z.]+)?$', s, re.I)
    if m:
        return to_num(m.group(1)), norm(m.group(2) or '')
    return to_num(v), ''


def parse_rows(rows, hdr_idx, mp, limit=5000):
    out = []
    blanks = 0
    header_keys = {nkey(c) for c in rows[hdr_idx] if nkey(c)}
    for r in rows[hdr_idx + 1:]:
        if len(out) >= limit:
            break
        cells = [norm(c) for c in r]
        joined = ' '.join(c for c in cells if c)
        if not joined:
            blanks += 1
            if blanks >= 15:
                break
            continue
        blanks = 0
        if STOP_RX.match(joined.strip()):
            break

        def cell(f):
            i = mp.get(f)
            return r[i] if i is not None and i < len(r) else None

        name = norm(cell('name'))
        if not name:
            continue

        row_keys = {nkey(c) for c in cells if nkey(c)}
        if row_keys and len(row_keys & header_keys) >= max(2, len(row_keys) * 0.6):
            continue

        qty, unit_in = split_qty_unit(cell('qty')) if 'qty' in mp else (None, '')
        price_col = to_num(cell('price'))
        total = to_num(cell('total'))
        unit = norm(cell('unit')) if 'unit' in mp else unit_in

        price = None
        src = 'total_div_qty'
        if total is not None and qty:
            price = round(total / qty, 4)
        elif price_col is not None:
            price, src = price_col, 'price_col'
        elif total is not None:
            price, src = total, 'total'

        art = clean_code(cell('article')) if 'article' in mp else ''
        art_guessed = False
        if not art:
            art = art_from_name(name)
            art_guessed = bool(art)

        mismatch = False
        if price_col and qty and total:
            mismatch = abs(price_col * qty - total) > max(0.05, total * 0.005)

        out.append({
            'num': norm(cell('num')) if 'num' in mp else '',
            'article': art,
            'article_guessed': art_guessed,
            'barcode': clean_code(cell('barcode')) if 'barcode' in mp else '',
            'name': name,
            'qty': qty,
            'unit': unit,
            'price': price,
            'total': total,
            'price_source': src,
            'price_mismatch': mismatch,
        })
    return out


def read_workbook(data, filename):
    name = (filename or '').lower()
    if name.endswith('.xls'):
        import xlrd
        wb = xlrd.open_workbook(file_contents=data)
        best = None
        for sh in wb.sheets():
            rows = [sh.row_values(i) for i in range(sh.nrows)]
            if best is None or len(rows) > len(best):
                best = rows
        return best or []
    import io
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    best = None
    for ws in wb.worksheets:
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        if best is None or len(rows) > len(best):
            best = rows
    return best or []


def header_signature(row):
    parts = [nkey(c) for c in row if nkey(c)]
    return '|'.join(parts)[:500]


def parse_invoice(data, filename, forced_mapping=None):
    rows = read_workbook(data, filename)
    if not rows:
        return {'error': 'Файл пустой или не читается'}

    hdr_idx, mapping = find_header(rows)
    if hdr_idx < 0:
        return {'error': 'Не нашёл строку заголовка таблицы'}

    if forced_mapping:
        mapping = {k: int(v) for k, v in forced_mapping.items() if v is not None}

    header_row = [norm(c) for c in rows[hdr_idx]]
    items = parse_rows(rows, hdr_idx, mapping)

    columns = []
    for idx, title in enumerate(header_row):
        if title:
            field = next((f for f, i in mapping.items() if i == idx), None)
            columns.append({'index': idx, 'title': title, 'field': field})

    return {
        'header_index': hdr_idx,
        'header_signature': header_signature(rows[hdr_idx]),
        'mapping': mapping,
        'columns': columns,
        'items': items,
        'stats': {
            'total': len(items),
            'guessed_article': sum(1 for i in items if i['article_guessed']),
            'no_article': sum(1 for i in items if not i['article']),
            'price_mismatch': sum(1 for i in items if i['price_mismatch']),
            'no_price': sum(1 for i in items if i['price'] is None),
        },
    }