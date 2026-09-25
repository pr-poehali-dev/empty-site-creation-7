import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import { permHeaders } from "@/hooks/useReceivingPerms";
import CatalogItemCard from "@/components/receiving/CatalogItemCard";
import {
  RECEIVING_CATALOG_URL,
  FIELD_TITLES,
  TECH_COLUMNS,
  cellText,
  factoryLabel,
  priceLabel,
  type CatalogMeta,
  type GroupRow,
  type ItemRow,
} from "@/lib/receivingCatalog";

const PAGE = 50;
const ALL = "__all__";

const ReceivingCatalog = () => {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [denied, setDenied] = useState(false);
  const [mode, setMode] = useState<"beauty" | "tech">("beauty");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState(ALL);
  const [brand, setBrand] = useState(ALL);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<GroupRow | null>(null);
  const seePrice = Boolean(meta?.visible.includes("price"));
  const timer = useRef<number>();

  useEffect(() => {
    fetch(`${RECEIVING_CATALOG_URL}?action=meta`, { headers: permHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          setDenied(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((d: CatalogMeta | null) => {
        if (!d) return;
        setMeta(d);
        setMode(d.modes.beauty ? "beauty" : "tech");
      })
      .catch(() => {
        setDenied(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSearch(q.trim()), 350);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  const query = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({
        action: mode === "beauty" ? "groups" : "items",
        limit: String(PAGE),
        offset: String(offset),
      });
      if (search) p.set("q", search);
      if (direction !== ALL) p.set("direction", direction);
      if (brand !== ALL) p.set("brand", brand);
      return `${RECEIVING_CATALOG_URL}?${p}`;
    },
    [mode, search, direction, brand],
  );

  const load = useCallback(
    async (offset: number) => {
      if (offset === 0) setLoading(true);
      else setMore(true);
      const r = await fetch(query(offset), { headers: permHeaders() });
      const d = await r.json();
      const rows = d.rows || [];
      if (mode === "beauty") {
        setGroups((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      } else {
        setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      }
      setTotal(d.total || 0);
      setLoading(false);
      setMore(false);
    },
    [query, mode],
  );

  useEffect(() => {
    if (!meta) return;
    load(0);
  }, [meta, load]);

  const shown = mode === "beauty" ? groups.length : items.length;
  const cols = TECH_COLUMNS.filter((f) => meta?.visible.includes(f));

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="Lock" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium mb-1">Нет доступа к каталогу приёмки</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/receipts")}>
            Назад
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => navigate("/admin/receipts")}
            >
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">Каталог приёмки</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? "Загружаю..." : `${total} ${mode === "beauty" ? "позиций" : "строк"}`}
              </p>
            </div>
            {meta?.modes.beauty && meta?.modes.tech && (
              <div className="flex rounded-lg border border-white/[0.08] p-0.5">
                <button
                  onClick={() => setMode("beauty")}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    mode === "beauty" ? "bg-violet-500/25 text-violet-200" : "text-muted-foreground"
                  }`}
                >
                  Красивые
                </button>
                <button
                  onClick={() => setMode("tech")}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    mode === "tech" ? "bg-violet-500/25 text-violet-200" : "text-muted-foreground"
                  }`}
                >
                  Технические
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Icon
                name="Search"
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  mode === "beauty" ? "Имя, бренд, модель" : "Имя, штрихкод, заказ-наряд"
                }
                className="h-9 pl-9"
              />
            </div>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Направление" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все направления</SelectItem>
                {meta?.directions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Бренд" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все бренды</SelectItem>
                {meta?.brands.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-4 py-4 flex-1">
        {loading && <p className="text-sm text-muted-foreground">Загружаю...</p>}

        {!loading && shown === 0 && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center">
            <Icon name="PackageSearch" size={36} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Ничего не нашлось</p>
          </div>
        )}

        {!loading && mode === "beauty" && groups.length > 0 && (
          <div className="space-y-2">
            {groups.map((g) => (
              <button
                key={`${g.product_group}|${g.brand}|${g.model}`}
                onClick={() => setOpen(g)}
                className="w-full rounded-xl border border-white/[0.08] bg-card p-3 flex items-center gap-3 text-left hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{g.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {g.direction || "без направления"}
                    {seePrice && priceLabel(g) ? ` · ${priceLabel(g)} ₽` : ""}
                  </div>
                  {factoryLabel(g) && (
                    <div className="text-xs text-sky-300/80 truncate mt-0.5">
                      <Icon name="Barcode" size={12} className="inline mr-1 -mt-0.5" />
                      {factoryLabel(g)}
                    </div>
                  )}
                </div>
                <div className="text-sm tabular-nums text-muted-foreground shrink-0">
                  {g.qty} шт
                </div>
                <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}

        {!loading && mode === "tech" && items.length > 0 && (
          <div className="rounded-xl border border-white/[0.08] bg-card overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-white/[0.08]">
                  {cols.map((f) => (
                    <th key={f} className="py-2 px-3 font-normal whitespace-nowrap">
                      {FIELD_TITLES[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-white/[0.04]">
                    {cols.map((f) => (
                      <td key={f} className="py-2 px-3 align-top whitespace-nowrap">
                        {cellText(f, it[f])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && shown < total && (
          <Button
            variant="outline"
            className="w-full mt-3"
            disabled={more}
            onClick={() => load(shown)}
          >
            {more ? "Загружаю..." : `Показать ещё (${total - shown})`}
          </Button>
        )}
      </main>

      {open && meta && (
        <CatalogItemCard
          row={open}
          meta={meta}
          onClose={() => setOpen(null)}
          onChanged={() => load(0)}
        />
      )}
    </div>
  );
};

export default ReceivingCatalog;