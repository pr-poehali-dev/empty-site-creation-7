import { useMemo } from "react";
import Icon from "@/components/ui/icon";
import { InvoiceItem } from "@/pages/odata/nomenApi";

type Column = { index: number; title: string; field: string | null };

const CAT_NAMES = ["категория", "категория поставщика", "категория товара", "группа", "группа товаров", "раздел", "тип товара", "вид номенклатуры", "вид товара"];

const nk = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export const guessCategoryColumn = (columns: Column[]): number | null => {
  const free = columns.filter((c) => !c.field);
  const exact = free.find((c) => CAT_NAMES.includes(nk(c.title)));
  if (exact) return exact.index;
  const part = free.find((c) => CAT_NAMES.some((n) => nk(c.title).includes(n)));
  return part ? part.index : null;
};

const catValue = (x: InvoiceItem, col: number | null) => (col === null ? "" : (x.cells?.[col] || "").trim()) || "—";

export const suggestExcluded = (items: InvoiceItem[], col: number | null) => {
  if (col === null) return new Set<string>();
  return new Set(
    Array.from(new Set(items.map((x) => catValue(x, col)))).filter((c) => /^для[\s\u00a0]/i.test(c)),
  );
};

interface Props {
  columns: Column[];
  items: InvoiceItem[];
  column: number | null;
  excluded: Set<string>;
  disabled: boolean;
  onColumn: (c: number | null) => void;
  onToggle: (cat: string) => void;
}

const NomenCategories = ({ columns, items, column, excluded, disabled, onColumn, onToggle }: Props) => {
  const cats = useMemo(() => {
    if (column === null) return [];
    const m = new Map<string, number>();
    items.forEach((x) => {
      const c = catValue(x, column);
      m.set(c, (m.get(c) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  }, [items, column]);

  const dropped = cats.filter((c) => excluded.has(c.category)).reduce((s, c) => s + c.count, 0);

  return (
    <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
      <div className="font-semibold flex items-center gap-2">
        <Icon name="Filter" size={18} className="text-primary" />
        Категории поставщика
        {column !== null && <span className="ml-auto text-xs font-normal text-muted-foreground">отсеется {dropped}</span>}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground shrink-0">Колонка в файле</span>
        <select
          className="flex-1 min-w-0 h-9 rounded-md border border-white/[0.08] bg-background px-2 text-sm"
          value={column ?? ""}
          disabled={disabled}
          onChange={(e) => onColumn(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">не используется</option>
          {columns.map((c) => (
            <option key={c.index} value={c.index}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {column === null ? (
        <p className="text-xs text-muted-foreground">Колонка категорий не выбрана — загружаются все строки.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Отметьте категории, которые не нужно загружать</p>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {cats.map((c) => (
              <label key={c.category} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={excluded.has(c.category)}
                  disabled={disabled}
                  onChange={() => onToggle(c.category)}
                />
                <span className={`flex-1 text-sm truncate ${excluded.has(c.category) ? "line-through text-muted-foreground" : ""}`}>
                  {c.category}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{c.count}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default NomenCategories;
