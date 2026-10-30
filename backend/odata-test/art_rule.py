"""Артикул из наименования товара. Одно правило для счетов, загрузки каталога и накладных 1С."""
import re

TOKEN = re.compile(r'(?<![\w/.-])([A-Za-zА-Яа-яЁё0-9]+(?:(?:--?|/|\.)[A-Za-zА-Яа-яЁё0-9]+)*)(?![\w/-])')
UP = re.compile(r'[A-ZА-ЯЁ]')
LOW = re.compile(r'[a-zа-яё]')
UNIT = re.compile(r'\d+(В|Вт|W|V|Л|л|мл|кг|г|мм|см|м|А|Гц|ГБ|GB|TB|MP|Мп)')
BRACKETS = re.compile(r'\([^()]*\)|\{[^{}]*\}|\[[^\[\]]*\]')


def _norm(s):
    return re.sub(r'\s+', ' ', str(s or '').replace('\xa0', ' ')).strip()


def _is_art(t):
    if not re.search(r'\d', t) or not UP.search(t):
        return False
    core = re.sub(r'[^0-9A-Za-zА-Яа-яЁё]', '', t)
    if len(core) < 4 and not (len(core) == 3 and '-' in t):
        return False
    if re.fullmatch(r'\d+([.,/]\d+)*[A-Za-zА-Яа-я]{0,3}', t) or UNIT.fullmatch(t):
        return False
    letters = re.sub(r'[^A-Za-zА-Яа-яЁё]', '', t)
    if len(letters) < 2 and '-' not in t and len(re.sub(r'\D', '', t)) < 3:
        return False
    if len(LOW.findall(letters)) > len(UP.findall(letters)) and '-' not in t:
        return False
    return True


def _pick(s):
    cands = [m.group(1).strip('.') for m in TOKEN.finditer(s)]
    cands = [c for c in cands if _is_art(c)]
    return cands[-1] if cands else ''


def art_from_name(name):
    """Последний код в наименовании целиком (RV-UR390, STE3170/80, КТ-4099--3). Сначала вне скобок."""
    s = _norm(name)
    return _pick(BRACKETS.sub(' ', s)) or _pick(s)
