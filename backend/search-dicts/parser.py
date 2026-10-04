"""Разбор наименования на группу, бренд, модель и признак. Только по тексту наименования —
одни и те же правила для каталога и для строки счёта поставщика."""
import re

CYR2LAT = str.maketrans('АВЕКМНОРСТХаеорсху', 'ABEKMHOPCTXaeopcxy')
WORD = r'0-9A-Za-zА-Яа-яЁё'
CYR = re.compile(r'[А-Яа-яЁё]')
LAT = re.compile(r'[A-Za-z]')
TAIL_BU = re.compile(r'[\s,]*б/у?\.?\s*$', re.IGNORECASE)


def squash(s):
    """Ключ для сравнения моделей: без регистра, пробелов и знаков, кириллица-двойники → латиница."""
    return re.sub(r'[^0-9a-zа-яё]', '', (s or '').translate(CYR2LAT).lower())


def clean(s):
    s = re.sub(r'\s+', ' ', s or '').strip(' ,;')
    return re.sub(r'\s+,', ',', s)


def find_brand(name, aliases):
    best = None
    for a in sorted({a for a in aliases if a}, key=len, reverse=True):
        m = re.search(r'(?<![' + WORD + r'])' + re.escape(a) + r'(?![' + WORD + r'])', name, re.IGNORECASE)
        if m and (best is None or m.start() < best.start()):
            best = m
    return best


def split_group(prefix):
    prefix = clean(prefix.lstrip('*'))
    if not prefix:
        return None, ''
    m = re.search(r',|\sиз\s', prefix)
    group, extra = (prefix[:m.start()], prefix[m.start():]) if m else (prefix, '')
    group = clean(group)
    if group:
        group = group[0].upper() + group[1:]
    return group or None, clean(extra)


def is_code(tok):
    """Код модели: начинается с буквы, есть латиница и цифра, не короче 4 знаков."""
    t = tok.rstrip(',;')
    return (
        len(t) >= 4 and t[0].isalpha() and '(' not in t and ')' not in t
        and LAT.search(t) and re.search(r'\d', t)
    )


EN_COLORS = {
    'black', 'white', 'inox', 'beige', 'biege', 'gold', 'grey', 'gray', 'silver', 'red', 'green',
    'blue', 'burgundy', 'cashmere', 'copper', 'pink', 'anthracite',
}


def is_model_word(tok):
    """Слово, которое может продолжать модель: без кириллицы, с буквой/цифрой и не цвет."""
    return (
        not CYR.search(tok) and re.search(r'[0-9A-Za-z]', tok)
        and tok.strip(',;').lower() not in EN_COLORS
    )


def pick_model(tail):
    toks = tail.split(' ') if tail else []
    depth = 0
    start = None
    for i, t in enumerate(toks):
        if depth == 0 and is_code(t):
            start = i
            break
        depth += t.count('(') - t.count(')')
        depth = max(depth, 0)

    if start is not None:
        end = start + 1
        if not toks[start].endswith(','):
            while end < len(toks) and is_model_word(toks[end]) and not toks[end].startswith('('):
                end += 1
                if toks[end - 1].endswith(','):
                    break
    else:
        start, end = 0, 0
        while end < len(toks) and is_model_word(toks[end]):
            end += 1
            if toks[end - 1].endswith(','):
                break

    model = clean(' '.join(toks[start:end]))
    rest = clean(' '.join(toks[:start] + toks[end:]))
    return model or None, rest


def implied_brand_pos(s):
    """Куда «встал бы» бренд, если его нет в названии: перед первым словом с латиницей или цифрой."""
    for m in re.finditer(r'\S+', s):
        if re.search(r'[0-9A-Za-z]', m.group()):
            return m.start()
    return len(s)


def parse_name(name, aliases, assume_brand=False):
    """Возвращает group/model/feature/status или None, если бренда в названии нет.
    assume_brand=True — бренда в названии нет, но он задан для всего счёта: считаем,
    что он стоит перед моделью, и разбираем остальное по тем же правилам."""
    s = re.sub(r'\s+', ' ', name or '').strip()
    m = find_brand(s, aliases)
    if m:
        b_start, b_end = m.start(), m.end()
    elif assume_brand:
        b_start = b_end = implied_brand_pos(s)
    else:
        return None
    group, extra = split_group(s[:b_start])
    tail = clean(TAIL_BU.sub('', s[b_end:]))
    model, rest = pick_model(tail)
    feature = clean(' '.join(x for x in [extra, rest] if x))
    status = 'parsed' if (group and model) else 'doubtful'
    return {'group': group, 'model': model, 'feature': feature or None, 'status': status}