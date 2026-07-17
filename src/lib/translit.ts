// Пары визуально похожих кириллических и латинских букв (верхний регистр).
// Используются для поиска, когда артикулы набирают в разных раскладках:
// "АВ123" (кириллица) и "AB123" (латиница) выглядят одинаково.
const CYR_TO_LAT: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O",
  Р: "P", С: "C", Т: "T", У: "Y", Х: "X", І: "I", Ѕ: "S",
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x",
};

const LAT_TO_CYR: Record<string, string> = {
  A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О",
  P: "Р", C: "С", T: "Т", Y: "У", X: "Х", I: "І",
  a: "а", e: "е", o: "о", p: "р", c: "с", y: "у", x: "х",
};

// Убирает регистр, пробелы, дефисы и прочие разделители — для нечёткого сравнения артикулов.
export const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/[\s\-_.,/\\]+/g, "");

// Заменяет каждый символ по карте, если он в ней есть.
const mapChars = (value: string, map: Record<string, string>): string =>
  value.replace(/./g, (ch) => map[ch] ?? ch);

// Возвращает набор вариантов написания строки: как есть, кириллица→латиница, латиница→кириллица.
// Все варианты нормализованы (без регистра/пробелов/дефисов).
export const transliterateVariants = (value: string): string[] => {
  const base = normalizeText(value);
  const variants = new Set<string>([
    base,
    normalizeText(mapChars(value, CYR_TO_LAT)),
    normalizeText(mapChars(value, LAT_TO_CYR)),
  ]);
  return Array.from(variants).filter(Boolean);
};

// Проверяет, содержит ли текст запрос с учётом транслитерации и разбивки на слова.
// Каждое слово запроса должно найтись в тексте (в любом варианте написания и порядке).
export const matchesTransliterated = (text: string, query: string): boolean => {
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystacks = transliterateVariants(text);
  return words.every((word) => {
    const needles = transliterateVariants(word);
    return needles.some((needle) =>
      haystacks.some((hay) => hay.includes(needle))
    );
  });
};

export default matchesTransliterated;
