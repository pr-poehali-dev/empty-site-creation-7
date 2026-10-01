import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import ShowMore from "./ShowMore";
import StockGroupRow from "./StockGroupRow";
import { dirTitle, loadGroups, type StockDir, type StockGroup } from "./stockApi";

interface Props {
  dir: StockDir;
  warehouse: string;
  query: string;
  /** При поиске направления сразу раскрыты — иначе найденное не видно. */
  initiallyOpen: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
}

/** Направление склада: свёрнуто, по тапу — позиции (красивые имена) порциями по 200. */
const StockDirRow = ({ dir, warehouse, query, initiallyOpen, selected, onToggle }: Props) => {
  const [open, setOpen] = useState(initiallyOpen);
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchPage = async (offset: number) => {
    setBusy(true);
    try {
      const d = await loadGroups(warehouse, dir.direction, query, offset);
      setGroups((prev) => (offset ? [...prev, ...d.rows] : d.rows));
      setTotal(d.total);
      setLoaded(true);
    } catch {
      /* можно свернуть и раскрыть ещё раз */
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && !loaded) fetchPage(0);
  }, [open]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <Icon
          name={open ? "ChevronDown" : "ChevronRight"}
          size={16}
          className="text-muted-foreground shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{dirTitle(dir.direction)}</span>
          <span className="block text-[11px] text-muted-foreground">позиций: {dir.positions}</span>
        </span>
        <span className="text-sm font-semibold shrink-0">{dir.qty}</span>
      </button>

      {open && (
        <div className="bg-white/[0.015] border-t border-white/[0.06] divide-y divide-white/[0.05]">
          {busy && groups.length === 0 && (
            <div className="pl-8 pr-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
              <Icon name="Loader2" size={13} className="animate-spin" />
              Загружаю позиции
            </div>
          )}
          {groups.map((g) => (
            <StockGroupRow
              key={`${g.product_group}|${g.brand}|${g.model}`}
              group={g}
              warehouse={warehouse}
              direction={dir.direction}
              query={query}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
          <ShowMore
            shown={groups.length}
            total={total}
            busy={busy}
            onMore={() => fetchPage(groups.length)}
            indent="pl-8"
          />
        </div>
      )}
    </div>
  );
};

export default StockDirRow;
