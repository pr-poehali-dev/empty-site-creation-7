import Icon from "@/components/ui/icon";
import { InvoiceItem } from "@/pages/odata/nomenApi";

type Column = { index: number; title: string; field: string | null };
export type TraceField = "country" | "gtd" | "rnpt";
export type TraceCols = Record<TraceField, number | null>;

export const EMPTY_TRACE_COLS: TraceCols = { country: null, gtd: null, rnpt: null };

export const cellOf = (x: InvoiceItem | undefined, col: number | null) => {
  if (!x || col === null) return "";
  const v = (x.cells?.[col] || "").trim();
  return ["-", "--", "—", "---"].includes(v) ? "" : v;
};

const FIELDS: { key: TraceField; label: string }[] = [
  { key: "country", label: "Страна" },
  { key: "gtd", label: "ГТД" },
  { key: "rnpt", label: "РНПТ" },
];

interface Props {
  columns: Column[];
  items: InvoiceItem[];
  value: TraceCols;
  disabled: boolean;
  onChange: (field: TraceField, col: number | null) => void;
}

const NomenTraceColumns = ({ columns, items, value, disabled, onChange }: Props) => (
  <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
    <div className="font-semibold flex items-center gap-2">
      <Icon name="Globe" size={18} className="text-primary" />
      Страна и прослеживаемость
    </div>
    <p className="text-xs text-muted-foreground">
      Укажите колонки файла. Если ГТД и РНПТ в одной колонке, выберите её в обоих полях. РНПТ — прослеживаемый, ГТД —
      нет.
    </p>
    {FIELDS.map((f) => {
      const col = value[f.key];
      const filled = col === null ? 0 : items.filter((x) => cellOf(x, col)).length;
      return (
        <div key={f.key} className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-sm w-16 shrink-0">{f.label}</span>
            <select
              className="flex-1 min-w-0 h-10 rounded-md border border-white/[0.08] bg-background px-2 text-sm"
              value={col ?? ""}
              disabled={disabled}
              onChange={(e) => onChange(f.key, e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">нет в файле</option>
              {columns.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          {col !== null && (
            <div className="text-xs text-muted-foreground pl-[76px]">
              заполнено у {filled} из {items.length}
            </div>
          )}
        </div>
      );
    })}
  </section>
);

export default NomenTraceColumns;
