import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import FloatingNames from "@/components/receiving/FloatingNames";
import { SiteCell, TotalCell } from "@/components/receiving/MarketPriceCells";
import MarketSettingsDialog from "@/components/receiving/market/MarketSettingsDialog";
import ParseCell from "@/components/price-desk/ParseCell";
import CalcPanel from "@/components/price-desk/CalcPanel";
import FinalPriceCell from "@/components/price-desk/FinalPriceCell";
import NewBaseCell from "@/components/price-desk/NewBaseCell";
import BasePanel from "@/components/price-desk/BasePanel";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { SITE_COLUMNS, TOTAL_COLUMNS, shortDate } from "@/lib/marketPrices";
import { money } from "@/lib/receivingCatalog";
import {
  deskGet,
  deskList,
  deskParse,
  deskSaveItem,
  deskSavePrice,
  deskSaveNewBase,
  type DeskItem,
  type PriceField,
  type DeskSet,
  type DeskSetShort,
} from "@/lib/priceDesk";

const AVG_TITLES: Record<string, string> = { total_ru: "Средняя РФ", total_by: "Средняя РБ" };

const SetsList = () => {
  const navigate = useNavigate();
  const [sets, setSets] = useState<DeskSetShort[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    deskList()
      .then((d) => setSets(d.sets))
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  }, []);
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(-1)}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Ценовой стол</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-2">
        {error && <p className="text-sm text-red-300">{error}</p>}
        {!sets && !error && <p className="text-sm text-muted-foreground">Загружаю...</p>}
        {sets && !sets.length && (
          <p className="text-sm text-muted-foreground">
            Наборов пока нет. Откройте заявку и нажмите кнопку ценового стола в шапке.
          </p>
        )}
        {sets?.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/admin/price-desk/${s.id}`)}
            className="w-full rounded-xl border border-white/[0.08] bg-card px-3 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.04]"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{s.title}</div>
              <div className="text-xs text-muted-foreground">
                {s.items} товаров · {shortDate(s.updated_at)}
              </div>
            </div>
            <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
          </button>
        ))}
      </main>
    </div>
  );
};

const PriceDeskSet = ({ setId }: { setId: number }) => {
  const navigate = useNavigate();
  const [set, setSet] = useState<DeskSet | null>(null);
  const [items, setItems] = useState<DeskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [parsing, setParsing] = useState<Record<number, boolean>>({});
  const [parsingAll, setParsingAll] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tableWrap = useRef<HTMLDivElement>(null);
  const nameHead = useRef<HTMLTableCellElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(0);

  const marketItems = useMemo(
    () => items.map((it) => ({ id: it.id, brand: it.brand, model: it.model })),
    [items],
  );
  const market = useMarketPrices(marketItems, items.length > 0);
  const siteCols = SITE_COLUMNS.filter((c) => market.sites.includes(c.key));

  const apply = (d: { set: DeskSet; items: DeskItem[] }) => {
    setSet(d.set);
    setItems(d.items);
  };

  const load = useCallback(() => {
    deskGet(setId)
      .then(apply)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [setId]);

  useEffect(load, [load]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, [loading]);

  const catalogItems = items.filter((i) => !i.is_new);
  const newItems = items.filter((i) => i.is_new);
  const unparsed = catalogItems.filter((i) => (i.parse_status || "none") === "none").length;

  const parseAll = async () => {
    setParsingAll(true);
    setError("");
    try {
      const d = await deskParse(setId);
      apply(d);
      const c = d.counts;
      setNotice(
        `Разобрано: ${c.parsed}, сомнительно: ${c.doubtful}` +
          (c.no_brand ? `, бренд не найден: ${c.no_brand}` : "") +
          ". Результат записан в карточки каталога.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setParsingAll(false);
    }
  };

  const parseOne = async (it: DeskItem) => {
    setParsing((p) => ({ ...p, [it.id]: true }));
    setError("");
    try {
      const d = await deskParse(setId, [it.id]);
      apply(d);
      if (d.counts.no_brand) setNotice(`«${it.name}»: бренд не найден — введите бренд и модель вручную`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setParsing((p) => ({ ...p, [it.id]: false }));
    }
  };

  const saveOne = async (it: DeskItem, brand: string, model: string) => {
    setError("");
    try {
      await deskSaveItem(setId, it.id, brand, model);
      const d = await deskGet(setId);
      apply(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      throw e;
    }
  };

  const savePrice = async (it: DeskItem, field: PriceField, value: string, reset = false) => {
    setError("");
    try {
      const d = await deskSavePrice(setId, it.id, field, value, reset);
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...d.item } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      throw e;
    }
  };

  const saveNewBase = async (it: DeskItem, value: string) => {
    setError("");
    try {
      const d = await deskSaveNewBase(setId, it.id, value);
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...d.item } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      throw e;
    }
  };

  const totals = useMemo(() => {
    let ru = 0;
    let by = 0;
    let empty = 0;
    items.forEach((it) => {
      const q = Number(it.quantity ?? 1) || 0;
      if (it.price_ru == null || it.price_by == null) empty += 1;
      if (it.price_ru != null) ru += Number(it.price_ru) * q;
      if (it.price_by != null) by += Number(it.price_by) * q;
    });
    return { ru, by, empty };
  }, [items]);

  const colCount = 7 + (market.allowed ? (market.canEdit ? 1 : 0) + siteCols.length + TOTAL_COLUMNS.length : 0);

  const renderRow = (it: DeskItem) => {
    const mi = { id: it.id, brand: it.brand, model: it.model };
    const hasModel = Boolean(it.brand && it.model);
    return (
      <tr key={it.id} data-row-id={it.id} className="border-b border-white/[0.04]">
        <td className="py-2 px-3 align-top min-w-[260px] max-w-[340px]">
          <div className="text-[13px] leading-4 break-words">{it.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {[it.article, it.group, it.quantity != null ? `${Number(it.quantity)} шт` : ""].filter(Boolean).join(" · ")}
          </div>
        </td>
        <td className="py-2 px-3 align-top whitespace-nowrap">
          <ParseCell item={it} busy={!!parsing[it.id]} onParse={() => parseOne(it)} onSave={(b, m) => saveOne(it, b, m)} />
        </td>
        <td className="py-2 px-3 align-top whitespace-nowrap">
          {it.is_new ? (
            <span className="text-muted-foreground text-xs">не в каталоге</span>
          ) : it.price_base != null ? (
            <>
              <span className="tabular-nums">{money(it.price_base)} BYN</span>
              {it.price_base_changed_at && (
                <span className="block text-[10px] text-muted-foreground">{shortDate(it.price_base_changed_at)}</span>
              )}
              {it.price_base_parsed && <span className="block text-[10px] text-emerald-300">с парсинга</span>}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-2 px-3 align-top whitespace-nowrap">
          <NewBaseCell item={it} onSave={(v) => saveNewBase(it, v)} />
        </td>
        <td className="py-2 px-3 align-top whitespace-nowrap">
          <FinalPriceCell
            value={it.price_by}
            manual={it.price_by_manual}
            digits={2}
            onSave={(v) => savePrice(it, "by", v)}
            onReset={() => savePrice(it, "by", "", true)}
          />
        </td>
        <td className="py-2 px-3 align-top whitespace-nowrap">
          <FinalPriceCell
            value={it.price_ru}
            manual={it.price_ru_manual}
            digits={0}
            onSave={(v) => savePrice(it, "ru", v)}
            onReset={() => savePrice(it, "ru", "", true)}
          />
        </td>
        <td className="py-2 px-1" />
        {market.allowed && market.canEdit && (
          <td className="py-1.5 px-2 align-top">
            {hasModel && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-violet-200 whitespace-nowrap"
                title="Запросить цены на всех включённых сайтах"
                onClick={() => market.fetchAll(mi)}
              >
                <Icon name="RefreshCw" size={13} className="mr-1" />
                Все сайты
              </Button>
            )}
          </td>
        )}
        {market.allowed &&
          siteCols.map((c) => (
            <td key={c.key} className="py-1.5 px-3 align-top whitespace-nowrap">
              {hasModel ? (
                <SiteCell
                  site={c.key}
                  row={market.rowOf(mi)}
                  busy={market.isBusy(mi, c.key)}
                  canEdit={market.canEdit}
                  onFetch={() => market.fetchPrice(mi, c.key)}
                  onExclude={() => market.excludePrice(mi, c.key)}
                  onConfirm={() => market.confirm(mi, c.key)}
                />
              ) : (
                <span className="text-[11px] text-muted-foreground">нет модели</span>
              )}
            </td>
          ))}
        {market.allowed &&
          TOTAL_COLUMNS.map((c) => (
            <td key={c.key} className="py-1.5 px-3 align-top whitespace-nowrap">
              {hasModel ? (
                <TotalCell
                  field={c.key}
                  row={market.rowOf(mi)}
                  canEdit={market.canEdit}
                  onSave={(v) => market.setTotal(mi, c.key, v)}
                />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
          ))}
      </tr>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header ref={headerRef} className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(-1)}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">Ценовой стол</h1>
              <p className="text-xs text-muted-foreground truncate">
                {set?.title || "Загружаю..."}
                {set && ` · ${catalogItems.length} из каталога${newItems.length ? `, ${newItems.length} новых` : ""}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Все наборы" onClick={() => navigate("/admin/price-desk")}>
              <Icon name="List" size={18} />
            </Button>
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-sky-500/40 text-sky-200"
              disabled={parsingAll || !unparsed}
              onClick={parseAll}
            >
              <Icon name={parsingAll ? "Loader2" : "ScanText"} size={14} className={`mr-1.5 ${parsingAll ? "animate-spin" : ""}`} />
              {unparsed ? `Разобрать неразобранные (${unparsed})` : "Все товары разобраны"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Разбор сразу пишется в карточку каталога, ручная правка помечается «вручную» и больше не перезаписывается.
            </span>
          </div>
          {set && (
            <CalcPanel
              set={set}
              items={items}
              onApply={apply}
              onSetChange={(patch) => setSet((prev) => (prev ? { ...prev, ...patch } : prev))}
              onError={setError}
            />
          )}
          {set && <BasePanel set={set} items={items} onApply={apply} onNotice={setNotice} onError={setError} />}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto w-full px-4 py-4 flex-1">
        {notice && (
          <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 flex items-center gap-2">
            <Icon name="Check" size={16} />
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice("")} className="text-emerald-200/70">
              <Icon name="X" size={14} />
            </button>
          </div>
        )}
        {(error || market.error) && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 flex items-center gap-2">
            <Icon name="TriangleAlert" size={16} />
            <span className="flex-1">{error || market.error}</span>
            <button
              onClick={() => {
                setError("");
                market.clearError();
              }}
              className="text-red-200/70"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
        )}
        {loading && <p className="text-sm text-muted-foreground">Загружаю...</p>}

        {!loading && items.length > 0 && (
          <div
            ref={tableWrap}
            className="relative rounded-xl border border-white/[0.08] bg-card overflow-auto overscroll-contain"
            style={{ maxHeight: `calc(100dvh - ${headerH + 24}px)` }}
          >
            <FloatingNames wrapRef={tableWrap} anchorRef={nameHead} names={items.map((it) => ({ id: it.id, name: it.name }))} />
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[2] bg-card shadow-[0_1px_0_rgba(255,255,255,0.08)]">
                <tr className="text-left text-xs text-muted-foreground">
                  <th ref={nameHead} className="py-2 px-3 font-normal">Товар</th>
                  <th className="py-2 px-3 font-normal whitespace-nowrap text-sky-200/80">Бренд и модель</th>
                  <th className="py-2 px-3 font-normal whitespace-nowrap">Базовая сейчас</th>
                  <th className="py-2 px-3 font-normal whitespace-nowrap text-emerald-200/90">Новая Базовая, BYN</th>
                  <th className="py-2 px-3 font-normal whitespace-nowrap text-amber-200/90">Цена РБ, BYN</th>
                  <th className="py-2 px-3 font-normal whitespace-nowrap text-amber-200/90">Цена РФ, RUB</th>
                  <th className="py-2 px-1" />
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
                        {AVG_TITLES[c.key]}, {c.cur}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {catalogItems.map(renderRow)}
                {newItems.length > 0 && (
                  <tr className="bg-amber-500/[0.06]">
                    <td colSpan={colCount} className="py-2 px-3 text-xs font-medium text-amber-200">
                      Новые товары ({newItems.length}) — созданы на лету, их нет в каталоге. Бренд и модель хранятся только в этом наборе.
                    </td>
                  </tr>
                )}
                {newItems.map(renderRow)}
              </tbody>
              <tfoot className="sticky bottom-0 z-[2] bg-card shadow-[0_-1px_0_rgba(255,255,255,0.08)]">
                <tr className="text-xs">
                  <td className="py-2 px-3 text-muted-foreground" colSpan={4}>
                    Итого с учётом количества
                    {totals.empty > 0 && <span className="text-amber-300"> · без цены: {totals.empty}</span>}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap tabular-nums font-medium">{money(totals.by)}</td>
                  <td className="py-2 px-3 whitespace-nowrap tabular-nums font-medium">
                    {Math.round(totals.ru).toLocaleString("ru-RU")}
                  </td>
                  <td colSpan={Math.max(colCount - 6, 1)} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!loading && !items.length && !error && <p className="text-sm text-muted-foreground">В наборе нет товаров</p>}
      </main>
      <MarketSettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          market.refresh();
        }}
      />
    </div>
  );
};

const PriceDesk = () => {
  const { id } = useParams();
  return id ? <PriceDeskSet setId={Number(id)} /> : <SetsList />;
};

export default PriceDesk;
