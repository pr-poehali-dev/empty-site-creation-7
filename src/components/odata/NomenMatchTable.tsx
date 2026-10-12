import { useState } from "react";
import Icon from "@/components/ui/icon";
import { InvoiceItem, MatchItem, MatchStatus } from "@/pages/odata/nomenApi";

export type Filter = "all" | MatchStatus;

export const STATUS_META: Record<MatchStatus, { label: string; cls: string; icon: string }> = {
  found: { label: "Есть в 1С", cls: "text-emerald-400 bg-emerald-500/10", icon: "CircleCheck" },
  multiple: { label: "Несколько", cls: "text-amber-400 bg-amber-500/10", icon: "Copy" },
  missing: { label: "Нет в 1С", cls: "text-rose-400 bg-rose-500/10", icon: "CirclePlus" },
  empty: { label: "Пусто в счёте", cls: "text-muted-foreground bg-white/[0.06]", icon: "CircleDashed" },
  error: { label: "Ошибка", cls: "text-rose-400 bg-rose-500/10", icon: "TriangleAlert" },
};

interface Props {
  items: InvoiceItem[];
  matches: (MatchItem | null)[];
  filter: Filter;
}

const NomenMatchTable = ({ items, matches, filter }: Props) => {
  const [open, setOpen] = useState<number | null>(null);

  const rows = items
    .map((it, i) => ({ it, m: matches[i], i }))
    .filter(({ m }) => filter === "all" || m?.status === filter);

  if (!rows.length) {
    return <div className="text-sm text-muted-foreground p-4 text-center">Нет позиций</div>;
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card divide-y divide-white/[0.06]">
      {rows.map(({ it, m, i }) => {
        const meta = m ? STATUS_META[m.status] : null;
        const cards = m?.cards || [];
        const canOpen = cards.length > 0;
        return (
          <div key={i} className="p-3">
            <button
              type="button"
              className="w-full text-left flex items-start gap-3"
              onClick={() => canOpen && setOpen(open === i ? null : i)}
            >
              <span className="text-xs text-muted-foreground w-7 shrink-0 pt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug">{it.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                  <span>Арт.: {it.article || "—"}</span>
                  <span>ШК: {it.barcode || "—"}</span>
                  <span>Кол-во: {it.qty ?? "—"}</span>
                </div>
              </div>
              <span
                className={`text-xs rounded-md px-2 py-1 shrink-0 flex items-center gap-1 ${
                  meta ? meta.cls : "text-muted-foreground bg-white/[0.06]"
                }`}
              >
                {meta ? (
                  <>
                    <Icon name={meta.icon} size={13} />
                    {meta.label}
                    {m?.status === "multiple" && ` (${cards.filter((c) => !c.deleted).length})`}
                  </>
                ) : (
                  "ждёт"
                )}
              </span>
              {canOpen && (
                <Icon
                  name={open === i ? "ChevronUp" : "ChevronDown"}
                  size={16}
                  className="text-muted-foreground shrink-0 mt-1"
                />
              )}
            </button>
            {m?.error && <div className="text-xs text-rose-400 mt-2 ml-10">{m.error}</div>}
            {open === i && canOpen && (
              <div className="mt-2 ml-10 space-y-1.5">
                {cards.map((c) => (
                  <div
                    key={c.key}
                    className={`text-xs rounded-lg border border-white/[0.08] p-2 ${
                      c.deleted ? "opacity-50 line-through" : ""
                    }`}
                  >
                    <div className="text-foreground">{c.name}</div>
                    <div className="text-muted-foreground">
                      Код {c.code} · Арт. {c.article || "—"}
                      {c.deleted && " · помечена на удаление"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default NomenMatchTable;
