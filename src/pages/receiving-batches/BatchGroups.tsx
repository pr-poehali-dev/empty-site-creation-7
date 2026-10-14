import { useState } from "react";
import Icon from "@/components/ui/icon";
import type { BatchItem } from "@/lib/batches";

interface Props {
  items: BatchItem[];
  flashId: number | null;
  flashKey: number;
}

interface Group {
  key: string;
  name: string;
  items: BatchItem[];
}

/** Ячейки по красивым наименованиям: последний добавленный — сверху. */
const groupItems = (items: BatchItem[]): Group[] => {
  const map = new Map<string, Group>();
  for (const it of items) {
    const key = `${it.product_group}|${it.brand}|${it.model}`;
    let g = map.get(key);
    if (!g) {
      g = { key, name: it.name || it.tech_name || "без наименования", items: [] };
      map.set(key, g);
    }
    g.items.push(it);
  }
  return Array.from(map.values());
};

const KindMark = ({ kind }: { kind: BatchItem["kind"] }) =>
  kind === "exact" ? (
    <span className="shrink-0 text-[11px] rounded-md px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
      подтверждена
    </span>
  ) : (
    <span className="shrink-0 text-[11px] rounded-md px-1.5 py-0.5 bg-amber-500/15 text-amber-200">
      подставлена
    </span>
  );

const BatchGroups = ({ items, flashId, flashKey }: Props) => {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = groupItems(items);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-card px-4 py-10 text-center">
        <Icon name="PackageOpen" size={32} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Пикните наклейку поставщика, заказ-наряд или заводской код
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = open.has(g.key);
        const flashing = flashId !== null && g.items.some((i) => i.id === flashId);
        const auto = g.items.filter((i) => i.kind === "auto").length;
        return (
          <div
            key={flashing ? `${g.key}#${flashKey}` : g.key}
            className={`rounded-xl border border-white/[0.08] bg-card overflow-hidden ${
              flashing ? "animate-flash-orange" : ""
            }`}
          >
            <button
              onClick={() => toggle(g.key)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2"
            >
              <Icon
                name="ChevronRight"
                size={16}
                className={`shrink-0 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-90" : ""
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm break-words">{g.name}</div>
                {auto > 0 && (
                  <div className="text-[11px] text-amber-200">подставлено: {auto}</div>
                )}
              </div>
              <span className="shrink-0 text-base font-semibold">{g.items.length}</span>
            </button>
            {isOpen && (
              <div className="border-t border-white/[0.06] divide-y divide-white/[0.06]">
                {g.items.map((it) => (
                  <div
                    key={it.id === flashId ? `${it.id}#${flashKey}` : it.id}
                    className={`px-3 py-2 pl-9 flex items-start gap-2 ${
                      it.id === flashId ? "animate-flash-orange" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs break-words">{it.tech_name}</div>
                      <div className="text-[11px] text-muted-foreground break-all">
                        {[it.supplier_barcode, it.order_number && `з/н ${it.order_number}`, it.warehouse]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <KindMark kind={it.kind} />
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

export default BatchGroups;
