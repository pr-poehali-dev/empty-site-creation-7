import { useState } from "react";
import Icon from "@/components/ui/icon";
import {
  BarcodeState,
  InvoiceItem,
  MatchItem,
  MatchStatus,
  FIELD_SHORT,
  FIELD_TITLES,
  MatchField,
} from "@/pages/odata/nomenApi";

export type Filter = "all" | MatchStatus | `bc_${BarcodeState}`;

export const STATUS_META: Record<MatchStatus, { label: string; cls: string; icon: string }> = {
  found: { label: "Есть в 1С", cls: "text-emerald-400 bg-emerald-500/10", icon: "CircleCheck" },
  multiple: { label: "Несколько", cls: "text-amber-400 bg-amber-500/10", icon: "Copy" },
  partial: { label: "Частично", cls: "text-orange-400 bg-orange-500/10", icon: "CircleHelp" },
  missing: { label: "Нет в 1С", cls: "text-rose-400 bg-rose-500/10", icon: "CirclePlus" },
  empty: { label: "Пусто в счёте", cls: "text-muted-foreground bg-white/[0.06]", icon: "CircleDashed" },
  error: { label: "Ошибка", cls: "text-rose-400 bg-rose-500/10", icon: "TriangleAlert" },
};

export const BC_META: Record<BarcodeState, { label: string; cls: string }> = {
  ok: { label: "ШК есть", cls: "text-emerald-400 bg-emerald-500/10" },
  none: { label: "Нет ШК", cls: "text-sky-400 bg-sky-500/10" },
  other: { label: "Другой ШК", cls: "text-amber-400 bg-amber-500/10" },
  taken: { label: "ШК занят", cls: "text-rose-400 bg-rose-500/10" },
  no_invoice: { label: "ШК нет в счёте", cls: "text-muted-foreground bg-white/[0.06]" },
  error: { label: "ШК: ошибка", cls: "text-rose-400 bg-rose-500/10" },
};

const DEFAULT_FIELDS: MatchField[] = ["article", "name"];

interface Props {
  items: InvoiceItem[];
  matches: (MatchItem | null)[];
  filter: Filter;
  showHits: boolean;
  fields?: MatchField[];
  renderExtra?: (i: number) => React.ReactNode;
}

const matchesFilter = (m: MatchItem | null, filter: Filter) => {
  if (filter === "all") return true;
  if (!m) return false;
  if (filter.startsWith("bc_")) return m.bc?.state === filter.slice(3);
  return m.status === filter;
};

const NomenMatchTable = ({ items, matches, filter, showHits, fields = DEFAULT_FIELDS, renderExtra }: Props) => {
  const [open, setOpen] = useState<number | null>(null);

  const rows = items
    .map((it, i) => ({ it, m: matches[i], i }))
    .filter(({ m }) => matchesFilter(m, filter));

  if (!rows.length) {
    return <div className="text-sm text-muted-foreground p-4 text-center">Нет позиций</div>;
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card divide-y divide-white/[0.06]">
      {rows.map(({ it, m, i }) => {
        const meta = m ? STATUS_META[m.status] : null;
        const cards = m?.cards || [];
        const bc = m?.bc;
        const canOpen = cards.length > 0 || !!bc;
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
                {(showHits && m?.hits) || bc ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {showHits &&
                      m?.hits &&
                      fields.map((f) => {
                        const h = m.hits?.[f];
                        return (
                          <span
                            key={f}
                            title={`${FIELD_TITLES[f]}: ${
                              h === null ? "пусто в счёте" : h ? "совпал" : "не найден"
                            }`}
                            className={`text-[10px] font-semibold w-5 h-5 rounded flex items-center justify-center ${
                              h === null
                                ? "bg-white/[0.04] text-muted-foreground/50"
                                : h
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-white/[0.08] text-muted-foreground"
                            }`}
                          >
                            {h === null ? "–" : FIELD_SHORT[f]}
                          </span>
                        );
                      })}
                    {bc && (
                      <span className={`text-[11px] rounded px-1.5 py-0.5 ${BC_META[bc.state].cls}`}>
                        {BC_META[bc.state].label}
                      </span>
                    )}
                  </div>
                ) : null}
                {renderExtra?.(i)}
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
                    {showHits && c.matched && (
                      <div className="text-muted-foreground mt-0.5">
                        Совпало: {c.matched.map((f) => FIELD_TITLES[f].toLowerCase()).join(", ")}
                      </div>
                    )}
                  </div>
                ))}
                {bc && (
                  <div className="text-xs rounded-lg border border-white/[0.08] p-2 text-muted-foreground">
                    Штрихкоды карточки в 1С: {bc.have?.length ? bc.have.join(", ") : "нет"}
                    {bc.owner && (
                      <div className="text-rose-400 mt-0.5">
                        ШК из счёта уже у карточки {bc.owner.code} — {bc.owner.name}
                      </div>
                    )}
                    {bc.error && <div className="text-rose-400 mt-0.5">{bc.error}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default NomenMatchTable;
