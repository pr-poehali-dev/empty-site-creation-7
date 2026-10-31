import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { money } from "@/lib/receivingCatalog";
import { STATUS_TEXT, priceHistory, type PriceHistoryItem, type SiteKey } from "@/lib/marketPrices";

interface Props {
  site: SiteKey;
  brand: string;
  model: string;
  cur?: string;
}

const when = (v: string) => {
  const d = new Date(String(v).replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const PriceHistoryList = ({ site, brand, model, cur }: Props) => {
  const [items, setItems] = useState<PriceHistoryItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    priceHistory(site, brand, model)
      .then((d) => setItems(d.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  }, [site, brand, model]);

  if (error) return <p className="text-xs text-red-300">{error}</p>;
  if (!items)
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon name="Loader2" size={12} className="animate-spin" /> загружаю историю...
      </p>
    );
  if (!items.length) return <p className="text-xs text-muted-foreground">Истории поиска пока нет</p>;

  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.08] divide-y divide-white/[0.06]">
      {items.map((h, i) => (
        <div key={i} className="px-2.5 py-1.5 text-xs flex items-start gap-2">
          <span className="text-muted-foreground tabular-nums whitespace-nowrap">{when(h.created_at)}</span>
          <span className="flex-1 min-w-0">
            {h.price != null ? (
              <span className="tabular-nums text-foreground">
                {money(h.price)} {cur}
              </span>
            ) : (
              <span className="text-amber-300">{STATUS_TEXT[h.status] || h.status}</span>
            )}
            {h.who && <span className="text-muted-foreground"> · {h.who}</span>}
            {h.title && <span className="block truncate text-muted-foreground" title={h.title}>{h.title}</span>}
          </span>
          {h.url && (
            <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 shrink-0">
              <Icon name="ExternalLink" size={12} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
};

export default PriceHistoryList;
