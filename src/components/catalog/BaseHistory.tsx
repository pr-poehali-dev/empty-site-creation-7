import { useState } from "react";
import Icon from "@/components/ui/icon";
import { SEARCH_DICTS_URL, authHeaders } from "@/components/search-dicts/api";

interface Row {
  id: number;
  old_price: number | string | null;
  new_price: number | string | null;
  source: string;
  rate_by_per_100_rub: number | string | null;
  set_title: string | null;
  created_at: string;
  who: string | null;
}

const SOURCE: Record<string, string> = {
  desk_avg_by: "Ценовой стол · средняя РБ",
  desk_avg_ru: "Ценовой стол · средняя РФ",
  desk_manual: "Ценовой стол · вручную",
  card: "Правка карточки",
  invoice: "Загрузка счёта",
  invoice_revert: "Отмена загрузки счёта",
  catalog_upload: "Загрузка в каталог",
};

const fmt = (v: number | string | null) =>
  v == null ? "—" : Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BaseHistory = ({ productId }: { productId: number }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || rows) return;
    try {
      const r = await fetch(`${SEARCH_DICTS_URL}?section=base_history&id=${productId}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      setRows(d.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.08]">
      <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Icon name="History" size={14} />
        <span className="flex-1 text-left">История Базовой цены</span>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} />
      </button>
      {open && (
        <div className="border-t border-white/[0.08] px-3 py-2 space-y-2 max-h-64 overflow-auto">
          {error && <p className="text-xs text-red-300">{error}</p>}
          {!rows && !error && <p className="text-xs text-muted-foreground">Загружаю...</p>}
          {rows && !rows.length && <p className="text-xs text-muted-foreground">Изменений пока не было</p>}
          {rows?.map((r) => (
            <div key={r.id} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="tabular-nums">
                  {fmt(r.old_price)} → <span className="text-foreground font-medium">{fmt(r.new_price)}</span> BYN
                </span>
                <span className="ml-auto text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              <div className="text-muted-foreground">
                {SOURCE[r.source] || r.source}
                {r.rate_by_per_100_rub != null && ` · курс ${Number(r.rate_by_per_100_rub)} BYN за 100 RUB`}
                {r.set_title && ` · ${r.set_title}`}
                {r.who && ` · ${r.who}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BaseHistory;
