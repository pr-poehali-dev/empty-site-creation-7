import json
import re

DEFAULTS = {
    'preps': [
        'для', 'к', 'ко', 'под', 'совместим', 'совместимый', 'совместимая', 'совместимо',
        'подходит', 'подходит для', 'аналог', 'вместо', 'на замену', 'замена', 'for',
    ],
    'parts': [
        'фильтр', 'щётк', 'мешк', 'мешок', 'насадк', 'аккумулятор', 'батаре', 'чехол', 'запчаст',
        'комплект', 'набор', 'салфетк', 'тряпк', 'картридж', 'шланг', 'крышк', 'колб', 'ролик',
        'валик', 'ремен', 'зарядн', 'адаптер', 'держател', 'кабел', 'пульт', 'сменн', 'контейнер',
        'резервуар', 'моп', 'губк', 'уплотнител', 'прокладк', 'плёнк', 'стекло', 'бойлер', 'тэн',
        'нагревател', 'нагревательный элемент', 'плата', 'модуль', 'мотор', 'двигател', 'помп',
        'насос', 'клапан', 'датчик', 'термостат', 'термопредохранител', 'шнур', 'подошв',
        'жернов', 'заварочный блок', 'капучинатор', 'ручк', 'кнопк', 'колес', 'дверц', 'решётк',
        'шестерн', 'предохранител', 'блок питания', 'вентилятор для', 'бак для', 'ёмкость для',
    ],
    'synonyms': [
        'утюг, парогенератор, гладильная система, паровая станция, паровая гладильная',
        'отпариватель, паровой отпариватель, ручной отпариватель, вертикальный отпариватель',
        'кофемашина, кофеварка, кофейная машина, эспрессо',
        'пылесос, робот-пылесос, робот пылесос, вертикальный пылесос, ручной пылесос, моющий пылесос',
        'электрочайник, чайник, термочайник',
        'термопот, чайник-термос',
        'мультиварка, скороварка, мультиварка-скороварка',
        'микроволновая печь, микроволновка, свч',
        'мини-печь, духовка, электропечь, жарочный шкаф',
        'блендер, погружной блендер, стационарный блендер',
        'мясорубка, электромясорубка',
        'соковыжималка, соковарка',
        'воздухоувлажнитель, увлажнитель, увлажнитель воздуха, мойка воздуха',
        'воздухоочиститель, очиститель воздуха',
        'вентилятор',
        'тепловентилятор, обогреватель, тепловая пушка',
        'конвектор, обогреватель',
        'радиатор, масляный радиатор, обогреватель',
        'водонагреватель, бойлер, проточный водонагреватель',
        'тостер',
        'аэрогриль, аэрофритюрница, мультипечь',
        'электрогриль, гриль',
        'хлебопечка, хлебопечь',
        'кофемолка, мельница',
        'фен, фен-щётка, стайлер, мультистайлер',
        'выпрямитель, выпрямитель волос, утюжок',
        'электробритва, бритва',
        'триммер, машинка для стрижки',
        'эпилятор',
        'ирригатор',
        'электрическая зубная щётка, зубная щётка',
        'приставка, smart-tv приставка, тв-приставка, медиаплеер',
        'приёмник, ресивер, тв-тюнер, цифровая приставка',
        'наушники, гарнитура',
        'колонка, акустика, портативная колонка, умная колонка',
        'саундбар',
        'швейная машина, оверлок',
        'весы',
        'вытяжка',
        'кухонный комбайн, кухонная машина, миксер',
        'вакуумный упаковщик, вакууматор',
    ],
    'plaus': {'site_on': True, 'site_ratio': 2, 'cross_on': True, 'cross_ratio': 2},
}

TITLES = {
    'preps': 'Предлоги принадлежности',
    'parts': 'Слова-запчасти',
    'synonyms': 'Синонимы типов товара',
    'plaus': 'Проверка цены на правдоподобие',
}


def _norm(s):
    return (s or '').lower().replace('ё', 'е').strip()


def load(cur):
    cur.execute("SELECT key, value FROM market_filters")
    saved = {r['key']: r['value'] for r in cur.fetchall()}
    out = {}
    for k, v in DEFAULTS.items():
        out[k] = saved[k] if k in saved else v
    return out


def save(cur, key, value):
    if key not in DEFAULTS:
        return 'Неизвестный список'
    if key == 'plaus':
        v = value or {}
        clean = {}
        for side in ('site', 'cross'):
            clean[f'{side}_on'] = bool(v.get(f'{side}_on'))
            try:
                r = float(str(v.get(f'{side}_ratio')).replace(',', '.'))
            except (TypeError, ValueError):
                return 'Множитель должен быть числом'
            if not 1.1 <= r <= 20:
                return 'Множитель от 1,1 до 20'
            clean[f'{side}_ratio'] = r
    else:
        if not isinstance(value, list):
            return 'Нужен список'
        seen, clean = set(), []
        for x in value:
            t = re.sub(r'\s+', ' ', str(x)).strip()[:200]
            if t and _norm(t) not in seen:
                seen.add(_norm(t))
                clean.append(t)
    cur.execute(
        "INSERT INTO market_filters (key, value, updated_at) VALUES "
        f"('{key}', '{json.dumps(clean, ensure_ascii=False).replace(chr(39), chr(39) * 2)}'::jsonb, NOW()) "
        "ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()"
    )
    return None


def reset(cur, key):
    if key not in DEFAULTS:
        return 'Неизвестный список'
    cur.execute(f"DELETE FROM market_filters WHERE key='{key}'")
    return None


class Rules:
    """Собранные из настроек правила для отбора карточек."""

    def __init__(self, cfg, group=''):
        self.cfg = cfg
        preps = sorted({_norm(p) for p in cfg['preps'] if _norm(p)}, key=len, reverse=True)
        self.prep_re = (
            re.compile(
                r'(?:^|[^a-zа-я0-9])(?:' + '|'.join(re.escape(p) for p in preps) + r')(?=[^a-zа-я0-9]|$)'
            )
            if preps else None
        )
        self.parts = [_norm(p) for p in cfg['parts'] if _norm(p)]
        self.types = self._types(group)
        self.plaus = cfg['plaus']

    def _types(self, group):
        g = _norm(group)
        if not g:
            return []
        terms = set()
        for line in self.cfg['synonyms']:
            words = [_norm(w) for w in str(line).split(',') if _norm(w)]
            if any(w in g or g.startswith(w) for w in words):
                terms.update(words)
        first = re.split(r'[\s(]', g)[0]
        if len(first) >= 3:
            terms.add(first)
        return [t[:max(4, len(t) - 1)] for t in terms]

    def is_part(self, title):
        t = re.sub(r'^[^a-zа-я0-9]+', '', _norm(title))
        if self.types and any(t.startswith(x) for x in self.types):
            return False
        return any(t.startswith(p) for p in self.parts)

    def own_type(self, before):
        if not self.types:
            return None
        b = _norm(before)
        return any(t in b for t in self.types)

    def prep_before(self, before):
        if not self.prep_re:
            return False
        return bool(self.prep_re.search(_norm(before)))
