import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { searchItems, type DailyItem } from "./dailyApi";

interface Props {
  onPick: (item: DailyItem) => void;
}

/** Поиск по мере ввода, без Enter — как в заявках и инвентаризации. */
const SearchBox = ({ onPick }: Props) => {
  const [value, setValue] = useState("");
  const [rows, setRows] = useState<DailyItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async (q: string) => {
    if (q.trim().length < 2) {
      setRows([]);
      setTouched(false);
      return;
    }
    setBusy(true);
    try {
      const r = await searchItems(q.trim());
      setRows(r.rows);
      setTouched(true);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  const onChange = (v: string) => {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(v), 300);
  };

  const pick = (item: DailyItem) => {
    onPick(item);
    setValue("");
    setRows([]);
    setTouched(false);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Icon
          name="Search"
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Штрихкод или заказ-наряд"
          inputMode="text"
          className="pl-9 h-11"
        />
        {busy && (
          <Icon
            name="Loader2"
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
          />
        )}
      </div>

      {rows.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-card divide-y divide-white/[0.06] overflow-hidden">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r)}
              className="w-full px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
            >
              <div className="text-sm truncate">{r.tech_name}</div>
              <div className="text-xs text-muted-foreground">
                {r.supplier_barcode}
                {r.order_number ? ` · ${r.order_number}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      {touched && !busy && rows.length === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-card px-3 py-3 text-center">
          <p className="text-sm text-muted-foreground">Ничего не нашли</p>
        </div>
      )}
    </div>
  );
};

export default SearchBox;
