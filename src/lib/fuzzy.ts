const normalize = (v: string) =>
  v.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");

/**
 * Расстояние Левенштейна: сколько правок нужно, чтобы превратить a в b.
 * Ограничено max — если правок больше, считать точнее незачем.
 */
const distance = (a: string, b: string, max: number): number => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
};

/** Допустимое число опечаток — зависит от длины запроса. */
const allowedTypos = (len: number) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

export interface Named {
  id: number;
  name: string;
}

/**
 * Оценка совпадения: чем меньше, тем лучше. null — не подходит.
 * Сначала точные вхождения, потом похожие с опечатками.
 */
const score = (name: string, query: string): number | null => {
  const n = normalize(name);
  const q = normalize(query);
  if (!q) return 0;

  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;

  const max = allowedTypos(q.length);
  if (max === 0) return null;

  const d = distance(n, q, max);
  if (d <= max) return 3 + d;

  // Опечатка внутри одного из слов названия.
  for (const word of n.split(" ")) {
    if (distance(word, q, max) <= max) return 5 + d;
  }
  return null;
};

/** Фильтр списка с учётом опечаток, отсортированный по близости. */
export function fuzzyFilter<T extends Named>(items: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item) => ({ item, s: score(item.name, q) }))
    .filter((x): x is { item: T; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.item.name.localeCompare(b.item.name))
    .map((x) => x.item);
}

/** Похожие названия для подсказки «может быть, вы имели в виду». */
export function findSimilar<T extends Named>(items: T[], query: string, limit = 3): T[] {
  const q = normalize(query);
  if (!q) return [];
  return items
    .map((item) => ({ item, s: score(item.name, q) }))
    .filter((x): x is { item: T; s: number } => x.s !== null && normalize(x.item.name) !== q)
    .sort((a, b) => a.s - b.s)
    .slice(0, limit)
    .map((x) => x.item);
}
