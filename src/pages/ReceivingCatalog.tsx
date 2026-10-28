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
import { saveScanSnapshot, useScanSnapshot } from "@/hooks/useCameraScan";
import CameraScanButton from "@/components/receiving/CameraScanButton";
import SimilarCodesDialog from "@/components/receiving/SimilarCodesDialog";
import { useSimilarCodes } from "@/hooks/useSimilarCodes";
import { permHeaders } from "@/hooks/useReceivingPerms";
import CatalogItemCard from "@/components/receiving/CatalogItemCard";
import ResetHistoryDialog from "@/components/receiving/ResetHistoryDialog";
import FloatingNames from "@/components/receiving/FloatingNames";
import { SiteCell, TotalCell } from "@/components/receiving/MarketPriceCells";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { SITE_COLUMNS, TOTAL_COLUMNS } from "@/lib/marketPrices";
import MarketSettingsDialog from "@/components/receiving/market/MarketSettingsDialog";
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
  const snap = useScanSnapshot<{
    mode: "beauty" | "tech";
    direction: string;
    brand: string;
    q: string;
  }>("catalog_search");
  const similar = useSimilarCodes("catalog");
  const [mode, setMode] = useState<"beauty" | "tech">("beauty");
  const [q, setQ] = useState(snap.q || "");
  const [search, setSearch] = useState(snap.q || "");
  const [direction, setDirection] = useState(snap.direction || ALL);
  const [brand, setBrand] = useState(snap.brand || ALL);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<GroupRow | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const seePrice = Boolean(meta?.visible.includes("price"));
  const timer = useRef<number>();
  const tableWrap = useRef<HTMLDivElement>(null);
  const nameHead = useRef<HTMLTableCellElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(0);
  const market = useMarketPrices(items, Boolean(meta) && mode === "tech");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const siteCols = SITE_COLUMNS.filter((c) => market.sites.includes(c.key));

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
        const back = snap.mode && d.modes[snap.mode] ? snap.mode : null;
        setMode(back || (d.modes.beauty ? "beauty" : "tech"));
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

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, [denied]);

  const shown = mode === "beauty" ? groups.length : items.length;

  const rememberScreen = () =>
    saveScanSnapshot("catalog_search", { mode, direction, brand, q });
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
      <header ref={headerRef} className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
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
            {market.isOwner && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="Настройки цен маркетплейсов"
                onClick={() => setSettingsOpen(true)}
              >
                <Icon name="Settings" size={18} />
              </Button>
            )}
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
            <div className="flex gap-2 flex-1 min-w-[180px]">
            <div className="relative flex-1">
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
            <CameraScanButton
              fieldKey="catalog_search"
              onCode={setQ}
              onOpen={rememberScreen}
              className="h-9 w-9"
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
        {notice && (
          <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 flex items-center gap-2">
            <Icon name="Check" size={16} />
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice("")} className="text-emerald-200/70">
              <Icon name="X" size={14} />
            </button>
          </div>
        )}
        {market.error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 flex items-center gap-2">
            <Icon name="TriangleAlert" size={16} />
            <span className="flex-1">{market.error}</span>
            <button onClick={market.clearError} className="text-red-200/70">
              <Icon name="X" size={14} />
            </button>
          </div>
        )}
        {loading && <p className="text-sm text-muted-foreground">Загружаю...</p>}

        {!loading && shown === 0 && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center">
            <Icon name="PackageSearch" size={36} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Ничего не нашлось</p>
            {/^\d{8,}$/.test(search) && (
              <Button
                variant="outline"
                className="mt-4 h-11 border-amber-500/40 text-amber-200"
                onClick={() => similar.open(search)}
              >
                <Icon name="SearchCheck" size={16} className="mr-1.5" />
                Найти похожие коды
              </Button>
            )}
          </div>
        )}

        {!loading && mode === "beauty" && groups.length > 0 && (
          <div className="space-y-2">
            {groups.map((g) => (
              <button
                key={`${g.product_group}|${g.brand}|${g.model}`}
                onClick={() => setOpen(g)}
                className="w-full rounded-xl border border-white/[0.08] bg-card px-3 py-1.5 flex items-center gap-3 text-left hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] leading-4 min-h-8 line-clamp-2 break-words">{g.name}</div>
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
          <div
            ref={tableWrap}
            className="relative rounded-xl border border-white/[0.08] bg-card overflow-auto overscroll-contain"
            style={{ maxHeight: `calc(100dvh - ${headerH + 24}px)` }}
          >
            {cols.includes("tech_name") && (
              <FloatingNames
                wrapRef={tableWrap}
                anchorRef={nameHead}
                names={items.map((it) => ({ id: it.id, name: String(it.tech_name ?? "") }))}
              />
            )}
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[2] bg-card shadow-[0_1px_0_rgba(255,255,255,0.08)]">
                <tr className="text-left text-xs text-muted-foreground">
                  {cols.map((f) => (
                    <th
                      key={f}
                      ref={f === "tech_name" ? nameHead : undefined}
                      className="py-2 px-3 font-normal whitespace-nowrap"
                    >
                      {FIELD_TITLES[f]}
                    </th>
                  ))}
                  {market.allowed && market.canEdit && <th className="py-2 px-3" />}
                  {market.allowed &&
                    siteCols.map((c) => (
                      <th key={c.key} className="py-2 px-3 font-normal whitespace-nowrap text-violet-200/80">
                        {c.title}, {c.cur}
                      </th>
                    ))}
                  {market.allowed &&
                    TOTAL_COLUMNS.map((c) => (
                      <th key={c.key} className="py-2 px-3 font-normal whitespace-nowrap text-emerald-200/80">
                        {c.title}, {c.cur}
                      </th>
                    ))}
                  {meta?.can_reset && <th className="py-2 px-3" />}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} data-row-id={it.id} className="border-b border-white/[0.04]">
                    {cols.map((f) => (
                      <td key={f} className="py-2 px-3 align-top whitespace-nowrap">
                        {cellText(f, it[f])}
                      </td>
                    ))}
                    {market.allowed && market.canEdit && (
                      <td className="py-1.5 px-2 align-top">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-violet-200 whitespace-nowrap"
                          title="Запросить цены на всех включённых сайтах"
                          onClick={() => market.fetchAll(it)}
                        >
                          <Icon name="RefreshCw" size={13} className="mr-1" />
                          Все цены
                        </Button>
                      </td>
                    )}
                    {market.allowed &&
                      siteCols.map((c) => (
                        <td key={c.key} className="py-1.5 px-3 align-top whitespace-nowrap">
                          <SiteCell
                            site={c.key}
                            row={market.rowOf(it)}
                            busy={market.isBusy(it, c.key)}
                            canEdit={market.canEdit}
                            onFetch={() => market.fetchPrice(it, c.key)}
                            onExclude={() => market.excludePrice(it, c.key)}
                            onConfirm={() => market.confirm(it, c.key)}
                          />
                        </td>
                      ))}
                    {market.allowed &&
                      TOTAL_COLUMNS.map((c) => (
                        <td key={c.key} className="py-1.5 px-3 align-top whitespace-nowrap">
                          <TotalCell
                            field={c.key}
                            row={market.rowOf(it)}
                            canEdit={market.canEdit}
                            onSave={(v) => market.setTotal(it, c.key, v)}
                          />
                        </td>
                      ))}
                    {meta?.can_reset && (
                      <td className="py-1 px-2 align-top">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-red-300 whitespace-nowrap"
                          onClick={() => setResetId(it.id)}
                        >
                          <Icon name="RotateCcw" size={14} className="mr-1" />
                          Сбросить историю
                        </Button>
                      </td>
                    )}
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
      <MarketSettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          market.refresh();
        }}
      />
      {resetId != null && (
        <ResetHistoryDialog
          itemId={resetId}
          onClose={() => setResetId(null)}
          onDone={() => {
            setResetId(null);
            setNotice("История товара сброшена — он как только что загруженный");
            load(0);
          }}
        />
      )}
      {similar.code && (
        <SimilarCodesDialog
          code={similar.code}
          place="catalog"
          onClose={similar.close}
          onCameraOpen={rememberScreen}
          onReplaced={(code) => {
            similar.close();
            setQ(code);
            setSearch(code);
            load(0);
          }}
        />
      )}
    </div>
  );
};

export default ReceivingCatalog;