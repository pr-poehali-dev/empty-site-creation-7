import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { authHeaders, SEARCH_DICTS_URL } from "@/components/search-dicts/api";

interface Found {
  id: number;
  name: string;
  article: string | null;
  model: string | null;
  search_group: string | null;
}

interface Props {
  initial?: string;
  brandId?: string;
  onPick: (id: number, name: string) => void;
}

const ManualProductSearch = ({ initial = "", brandId, onPick }: Props) => {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Found[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ section: "find", q: query });
        if (brandId) params.set("brand_id", brandId);
        const r = await fetch(`${SEARCH_DICTS_URL}?${params}`, { headers: authHeaders() });
        const d = await r.json();
        setItems(r.ok ? d.items || [] : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q, brandId]);

  return (
    <div className="mt-2 rounded-lg border border-white/[0.08] bg-card p-2 space-y-1.5">
      <div className="relative">
        <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Часть названия или модели…"
          className="w-full h-9 rounded-lg bg-secondary border border-white/[0.08] pl-8 pr-8 text-sm outline-none focus:border-primary/50"
        />
        {loading && <Icon name="Loader2" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {q.trim().length >= 2 && !loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground px-1 py-2">Ничего не найдено</p>
      )}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onPick(it.id, it.name)}
            className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-white/[0.06] transition"
          >
            <p className="text-sm break-words">{it.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {[it.model && `модель ${it.model}`, it.article && `арт. ${it.article}`, it.search_group].filter(Boolean).join(" · ")}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ManualProductSearch;
