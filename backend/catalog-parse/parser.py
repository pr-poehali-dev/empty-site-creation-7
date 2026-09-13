import re

SYN = {
    'article': ['артикул', 'арт', 'арт.', 'код товара', 'код'],
    'barcode': ['штрихкод', 'штрих-код', 'шк', 'ean', 'штрих код', 'штрихкод ean13'],
    'name': ['наименование', 'товар', 'номенклатура', 'наименование товара',
             'название', 'описание', 'товары'],
    'category': ['категория', 'группа', 'раздел', 'тип товара', 'категория товара'],
    'brand': ['бренд', 'производитель', 'торговая марка', 'марка'],
    'tnved': ['тнвэд', 'тн вэд', 'код тнвэд', 'тн вэд еаэс'],
    'weight_gross': ['вес брутто', 'масса брутто', 'брутто'],
    'weight_net': ['вес нетто', 'масса нетто', 'нетто', 'вес'],
    'price_retail': ['розничная цена', 'цена розничная', 'ррц', 'ррц, руб', 'розница'],
    'price_wholesale': ['оптовая цена', 'цена оптовая', 'опт', 'опт, руб'],
    'price': ['цена', 'стоимость'],
}

FIELD_TITLES = {
    'article': 'Артикул', 'barcode': 'Штрихкод', 'name': 'Наименование',
    'category': 'Категория поставщика', 'brand': 'Бренд', 'tnved': 'Код ТНВЭД',
    'weight_gross': 'Вес брутто', 'weight_net': 'Вес нетто',
    'price_retail': 'Розничная цена', 'price_wholesale': 'Оптовая цена', 'price': 'Цена',
}

PRICE_FIELDS = ['price_retail', 'price_wholesale', 'price']

CYR_UNIQUE = set('БГДЁЖЗИЙЛПФЦЧШЩЪЫЬЭЮЯ')
CYR_TWINS = set('АВЕКМНОРСТУХ')
CYR_ALL = CYR_UNIQUE | CYR_TWINS
LAT = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ')

TWIN_CYR_TO_LAT = str.maketrans('АВЕКМНОРСТУХавекмнорстух',
                                'ABEKMHOPCTYXabekmhopctyx')
TWIN_LAT_TO_CYR = str.maketrans('ABEKMHOPCTYXabekmhopctyx',
                                'АВЕКМНОРСТУХавекмнорстух')


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
    return hits, mapping


def find_header(rows, limit=30):
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
    s = norm(v).replace(' ', '').replace(',', '.')
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


def article_alphabet(article):
    """Определяет алфавит артикула: lat, cyr_unique, cyr_twins, mixed, none."""
    a = (article or '').upper()
    has_cyr = any(ch in CYR_ALL for ch in a)
    has_lat = any(ch in LAT for ch in a)
    if has_cyr and has_lat:
        return 'mixed'
    if has_cyr:
        if any(ch in CYR_UNIQUE for ch in a):
            return 'cyr_unique'
        return 'cyr_twins'
    if has_lat:
        return 'lat'
    return 'none'


def convert_article(article, mode):
    """mode: as_is | cyrillic | latin"""
    if not article or mode == 'as_is':
        return article
    if mode == 'latin':
        return article.translate(TWIN_CYR_TO_LAT)
    if mode == 'cyrillic':
        return article.translate(TWIN_LAT_TO_CYR)
    return article


def parse_rows(rows, hdr_idx, mp, limit=100000):
    out = []
    for r in rows[hdr_idx + 1:]:
        if len(out) >= limit:
            break
        if not r or all(norm(c) == '' for c in r):
            continue

        def cell(f):
            i = mp.get(f)
            if i is None or i >= len(r):
                return None
            return r[i]

        name = norm(cell('name'))
        if not name:
            continue

        article = clean_code(cell('article'))
        guessed = False
        if not article:
            article = art_from_name(name)
            guessed = bool(article)

        item = {
            'row': len(out),
            'name': name,
            'article': article,
            'article_guessed': guessed,
            'alphabet': article_alphabet(article),
            'barcode': clean_code(cell('barcode')),
            'category': norm(cell('category')),
            'brand': norm(cell('brand')),
            'tnved': clean_code(cell('tnved')),
            'weight_gross': to_num(cell('weight_gross')),
            'weight_net': to_num(cell('weight_net')),
        }
        for pf in PRICE_FIELDS:
            item[pf] = to_num(cell(pf))
        out.append(item)
    return out


def read_workbook(data, filename):
    name = (filename or '').lower()
    if name.endswith('.xls'):
        import xlrd
        wb = xlrd.open_workbook(file_contents=data)
        best = None
        for sh in wb.sheets():
            rws = [sh.row_values(i) for i in range(sh.nrows)]
            if best is None or len(rws) > len(best):
                best = rws
        return best or []
    import io
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    best = None
    for ws in wb.worksheets:
        rws = [list(r) for r in ws.iter_rows(values_only=True)]
        if best is None or len(rws) > len(best):
            best = rws
    return best or []


def header_signature(row):
    parts = [nkey(c) for c in row if nkey(c)]
    return '|'.join(parts)[:500]


def category_stats(items):
    """Категории поставщика с числом товаров и подсказкой об аксессуарах."""
    agg = {}
    for it in items:
        c = it['category'] or '—'
        if c not in agg:
            agg[c] = {'category': c, 'count': 0, 'suggest_exclude': False}
        agg[c]['count'] += 1
    for c, v in agg.items():
        low = c.lower()
        v['suggest_exclude'] = low.startswith('для ') or low.startswith('для\u00a0')
    return sorted(agg.values(), key=lambda x: -x['count'])


def alphabet_stats(items):
    st = {'lat': 0, 'cyr_unique': 0, 'cyr_twins': 0, 'mixed': 0, 'none': 0}
    samples = {'cyr_unique': [], 'cyr_twins': [], 'mixed': []}
    for it in items:
        a = it['alphabet']
        st[a] = st.get(a, 0) + 1
        if a in samples and len(samples[a]) < 5:
            samples[a].append(it['article'])
    st['samples'] = samples
    return st


def parse_catalog(data, filename, forced_mapping=None):
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
        'categories': category_stats(items),
        'alphabet': alphabet_stats(items),
        'stats': {
            'total': len(items),
            'guessed_article': sum(1 for i in items if i['article_guessed']),
            'no_article': sum(1 for i in items if not i['article']),
            'with_barcode': sum(1 for i in items if i['barcode']),
            'with_tnved': sum(1 for i in items if i['tnved']),
            'with_weight_gross': sum(1 for i in items if i['weight_gross'] is not None),
            'with_weight_net': sum(1 for i in items if i['weight_net'] is not None),
        },
    }
