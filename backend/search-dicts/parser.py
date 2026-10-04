"""Разбор наименования товара на группу, бренд, модель и признак."""
import re

CYR2LAT = str.maketrans('АВЕКМНОРСТХаеорсху', 'ABEKMHOPCTXaeopcxy')
WORD = r'0-9A-Za-zА-Яа-яЁё'

COLOR_WORDS = [
    'нержавеющая сталь', 'розовое золото', 'розовым золотом', 'белое стекло', 'черное стекло',
    'чёрное стекло', 'прозрачное стекло', 'вставка сатин', 'чёрный антрацит', 'черный антрацит',
    'черный матовый', 'чёрный матовый', 'белый', 'черный', 'чёрный', 'бежевый', 'золотистый',
    'золотой', 'бургундия', 'зелёный', 'зеленый', 'кашемир', 'медный', 'серый', 'серебристый',
    'красный', 'синий', 'голубой', 'графит', 'антрацит',
]
COLOR_RE = re.compile(
    r'(?<![' + WORD + r'])(' + '|'.join(re.escape(c) for c in COLOR_WORDS) + r')(?![' + WORD + r'])',
    re.IGNORECASE,
)
TAIL_BU = re.compile(r'[\s,]*б/у?\.?\s*$', re.IGNORECASE)


def squash(s):
    return re.sub(r'[^0-9a-zа-яё]', '', (s or '').translate(CYR2LAT).lower())


def clean(s):
    s = re.sub(r'\s+', ' ', s or '').strip(' ,;')
    return s


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


def find_article(tail, article):
    art = (article or '').strip()
    if not art:
        return None
    low = tail.lower()
    for v in {art, art.replace('/', '\\'), art.replace('\\', '/')}:
        i = low.find(v.lower())
        while i >= 0:
            before = tail[i - 1] if i > 0 else ' '
            after = tail[i + len(v)] if i + len(v) < len(tail) else ' '
            if not re.match(r'[' + WORD + ']', before) and not re.match(r'[' + WORD + ']', after):
                return i, i + len(v)
            i = low.find(v.lower(), i + 1)
    key = squash(art)
    if not key:
        return None
    toks = [(m.start(), m.end()) for m in re.finditer(r'\S+', tail)]
    for size in range(1, 5):
        for k in range(len(toks) - size + 1):
            a, b = toks[k][0], toks[k + size - 1][1]
            if squash(tail[a:b]) == key:
                return a, b
    return None


def parse_name(name, article, aliases):
    """Возвращает словарь group/model/feature/status или None, если бренда в названии нет."""
    s = re.sub(r'\s+', ' ', name or '').strip()
    m = find_brand(s, aliases)
    if not m:
        return None
    group, extra = split_group(s[:m.start()])
    tail = clean(TAIL_BU.sub('', s[m.end():]))

    model, rest, sure = '', '', False
    pos = find_article(tail, article)
    if pos:
        model = clean(tail[pos[0]:pos[1]])
        rest = tail[:pos[0]] + ' ' + tail[pos[1]:]
        sure = True
    else:
        c = COLOR_RE.search(tail)
        if c and c.start() > 0:
            model, rest = clean(tail[:c.start()]), tail[c.start():]
            sure = bool(article) and squash(article).startswith(squash(model))
        else:
            model = tail
            sure = bool(article) and squash(article) == squash(tail)

    feature = clean(' '.join(x for x in [extra, rest] if x).strip())
    feature = clean(re.sub(r'\s+,', ',', re.sub(r'^[,\s]+', '', feature)))
    status = 'parsed' if (group and model and sure) else 'doubtful'
    return {'group': group, 'model': model or None, 'feature': feature or None, 'status': status}