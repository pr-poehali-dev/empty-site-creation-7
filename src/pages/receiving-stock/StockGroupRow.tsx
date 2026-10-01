import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@/components/ui/icon";
import ShowMore from "./ShowMore";
import UnitHistory from "./UnitHistory";
import { loadUnits, type StockGroup, type StockUnit } from "./stockApi";

interface Props {
  group: StockGroup;
  warehouse: string;
  direction: string;
  query?: string;
  selected: Set<number>;
  onToggle: (id: number) => void;
}

/** Строка остатка: позиция и количество, по тапу — конкретные единицы. */
const StockGroupRow = ({ group, warehouse, direction, query = "", selected, onToggle }: Props) => {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyOf, setHistoryOf] = useState<number | null>(null);

  const factory =
    group.factory_variants > 1
      ? `заводских кодов: ${group.factory_variants}`
      : group.factory_barcode || "";

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && units.length === 0) {
      setBusy(true);
      try {
        const d = await loadUnits(warehouse, direction, group, query);
        setUnits(d.rows);
        setTotal(d.total);
      } catch {
        setUnits([]);
      } finally {
        setBusy(false);
      }
    }
  };

  const loadMore = async () => {
    setMore(true);
    try {
      const d = await loadUnits(warehouse, direction, group, query, units.length);
      setUnits((prev) => [...prev, ...d.rows]);
      setTotal(d.total);
    } catch {
      /* кнопка останется — можно нажать ещё раз */
    } finally {
      setMore(false);
    }
  };

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full pl-8 pr-4 py-1.5 flex items-center gap-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <Icon
          name={open ? "ChevronDown" : "ChevronRight"}
          size={16}
          className="text-muted-foreground shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] leading-4 min-h-8 line-clamp-2 break-words">{group.name}</span>
          {factory && (
            <span className="block text-xs text-sky-300/80 break-all mt-0.5">
              <Icon name="Barcode" size={12} className="inline mr-1 -mt-0.5" />
              {factory}
            </span>
          )}
        </span>
        <span className="text-sm font-semibold shrink-0">{group.qty}</span>
      </button>

      {open && (
        <div className="bg-white/[0.02] border-t border-white/[0.06]">
          {busy && (
            <div className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
              <Icon name="Loader2" size={13} className="animate-spin" />
              Загружаю единицы
            </div>
          )}

          {units.map((u) => (
            <div key={u.id} className="border-b border-white/[0.05] last:border-0">
              <div className="pl-12 pr-4 py-2 flex items-start gap-3">
                <Checkbox
                  checked={selected.has(u.id)}
                  onCheckedChange={() => onToggle(u.id)}
                  className="mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs leading-4 line-clamp-2 break-words">{u.tech_name}</div>
                  <div className="text-[11px] text-muted-foreground break-all">
                    {u.supplier_barcode}
                  </div>
                  {u.declared_defect?.trim() && (
                    <div className="text-xs text-muted-foreground break-words">
                      {u.declared_defect}
                    </div>
                  )}
                  {u.checked_by_name && (
                    <div className="text-[11px] text-muted-foreground">
                      проверил: {u.checked_by_name}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setHistoryOf(historyOf === u.id ? null : u.id)}
                  className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06]"
                  aria-label="История"
                >
                  <Icon
                    name="History"
                    size={14}
                    className={historyOf === u.id ? "text-sky-400" : "text-muted-foreground"}
                  />
                </button>
              </div>
              {historyOf === u.id && <UnitHistory itemId={u.id} />}
            </div>
          ))}
          <ShowMore shown={units.length} total={total} busy={more} onMore={loadMore} indent="pl-12" />
        </div>
      )}
    </div>
  );
};

export default StockGroupRow;