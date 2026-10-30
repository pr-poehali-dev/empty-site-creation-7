import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import ConvertLayout from "./convert/ConvertLayout";
import { CONVERT_MENU } from "./convert/convertSections";
import { ODATA_BASES } from "./odata/bases";
import { saveToYuraFiles } from "./odata/nomenExcel";
import WaybillList from "./convert/waybill/WaybillList";
import WaybillResult from "./convert/waybill/WaybillResult";
import AutoArticles from "./convert/waybill/AutoArticles";
import {
  DocType,
  PriceRule,
  WbBuild,
  WbItem,
  finalPrice,
  guessBrand,
  findTwins,
  writeArticles,
  ArtResult,
  Twin,
  WbDoc,
  buildCatalogXlsx,
  buildWaybillItems,
  catalogFileName,
  listWaybills,
} from "./convert/waybill/api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

const Tile = ({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
      active ? "border-primary bg-primary/10" : "border-white/[0.08] hover:bg-white/[0.04]"
    }`}
  >
    {children}
  </button>
);

const ConvertWaybillCatalog = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const bases = ODATA_BASES.filter((b) => b.ready);
  const [base, setBase] = useState(bases[0]?.slug || "trade-resurs");
  const [docType, setDocType] = useState<DocType>("sale");
  const [dateFrom, setDateFrom] = useState(iso(monthsAgo(3)));
  const [dateTo, setDateTo] = useState(iso(new Date()));
  const [docs, setDocs] = useState<WbDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<WbBuild | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [rule, setRule] = useState<PriceRule>("max");
  const [picks, setPicks] = useState<Record<string, number>>({});
  const priceOf = (x: WbItem) => finalPrice(x, rule, picks);
  const [brands, setBrands] = useState<Record<string, string>>({});
  const brandOf = (x: WbItem) => (brands[x.key] !== undefined ? brands[x.key] : guessBrand(x.name, x.group)).trim();
  const [twins, setTwins] = useState<Record<string, Twin[]> | null>(null);
  const [twinsLoading, setTwinsLoading] = useState(false);
  const [written, setWritten] = useState<Record<string, ArtResult>>({});
  const [writing, setWriting] = useState(false);

  const baseTitle = bases.find((b) => b.slug === base)?.title || base;
  const typeTitle = docType === "sale" ? "Реализация" : "Поступление";

  const load = async () => {
    setLoading(true);
    setError("");
    setSelected(new Set());
    setResult(null);
    setSaved(null);
    try {
      setDocs(await listWaybills(base, docType, dateFrom, dateTo));
    } catch (e) {
      setDocs([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, docType]);

  const pickedDocs = useMemo(() => docs.filter((d) => selected.has(d.key)), [docs, selected]);

  const toggle = (k: string) => {
    setResult(null);
    setSaved(null);
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const setMany = (keys: string[], on: boolean) => {
    setResult(null);
    setSaved(null);
    setSelected((p) => {
      const n = new Set(p);
      keys.forEach((k) => (on ? n.add(k) : n.delete(k)));
      return n;
    });
  };

  const build = async () => {
    setBuilding(true);
    setResult(null);
    setSaved(null);
    setPicks({});
    setBrands({});
    setTwins(null);
    setWritten({});
    try {
      const r = await buildWaybillItems(base, docType, [...selected]);
      setResult(r);
      const arts = [...new Set(r.items.filter((x) => x.article_auto).map((x) => x.article))];
      if (arts.length) {
        setTwinsLoading(true);
        findTwins(base, arts)
          .then(setTwins)
          .catch((e) => toast({ title: "Не проверил совпадения артикулов", description: (e as Error).message, variant: "destructive" }))
          .finally(() => setTwinsLoading(false));
      }
    } catch (e) {
      toast({ title: "Не удалось собрать товары", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBuilding(false);
    }
  };

  const writeArts = async () => {
    if (!result) return;
    const rows = result.items
      .filter((x) => x.article_auto && written[x.key]?.state !== "written")
      .map((x) => ({ key: x.key, article: x.article }));
    if (!rows.length) return;
    setWriting(true);
    try {
      const res = await writeArticles(base, rows);
      setWritten((p) => {
        const n = { ...p };
        res.forEach((r) => (n[r.key] = r));
        return n;
      });
      const ok = res.filter((r) => r.state === "written").length;
      toast({ title: `Записано в 1С: ${ok} из ${rows.length}` });
    } catch (e) {
      toast({ title: "Не удалось записать артикулы", description: (e as Error).message, variant: "destructive" });
    } finally {
      setWriting(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const numbers = result.docs.map((d) => d.number);
      const fileName = catalogFileName(baseTitle, docType, numbers);
      const b64 = buildCatalogXlsx(result.items, priceOf, brandOf);
      await saveToYuraFiles(
        b64,
        fileName,
        `Каталог из накладных: ${baseTitle}`,
        `${typeTitle}: ${numbers.join(", ")} · товаров ${result.items.length} · цена из последней накладной`,
      );
      setSaved(fileName);
      toast({ title: "Файл сохранён в «Файлы от Юры»" });
    } catch (e) {
      toast({ title: "Не сохранил файл", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || building || saving;

  return (
    <ConvertLayout title="Из накладных 1С в каталог" back={CONVERT_MENU}>
      <div className="space-y-4">
        <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
          <div className="font-semibold flex items-center gap-2">
            <Icon name="Database" size={18} className="text-primary" />
            1. База и тип накладных
          </div>
          <div className="grid grid-cols-2 gap-2">
            {bases.map((b) => (
              <Tile key={b.slug} active={base === b.slug} disabled={busy} onClick={() => setBase(b.slug)}>
                {b.title}
              </Tile>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Tile active={docType === "sale"} disabled={busy} onClick={() => setDocType("sale")}>
              Реализация
            </Tile>
            <Tile active={docType === "receipt"} disabled={busy} onClick={() => setDocType("receipt")}>
              Поступление
            </Tile>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground block">С</span>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground block">По</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </label>
            <Button variant="outline" onClick={load} disabled={busy}>
              <Icon name={loading ? "Loader2" : "RefreshCw"} size={15} className={loading ? "animate-spin" : ""} />
              Показать
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
          <div className="font-semibold flex items-center gap-2">
            <Icon name="ListChecks" size={18} className="text-primary" />
            2. Накладные · {typeTitle}
          </div>
          {loading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Icon name="Loader2" size={15} className="animate-spin" />
              Загружаю из 1С
            </div>
          )}
          {error && <div className="text-sm text-rose-400">{error}</div>}
          {!loading && !error && (
            <WaybillList docs={docs} selected={selected} onToggle={toggle} onSet={setMany} disabled={busy} />
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={build} disabled={busy || !selected.size}>
              <Icon name={building ? "Loader2" : "PackageSearch"} size={16} className={building ? "animate-spin" : ""} />
              {building ? "Собираю товары…" : `Собрать товары (${selected.size})`}
            </Button>
            {pickedDocs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Выбрано: {pickedDocs.map((d) => d.number).join(", ")}
              </span>
            )}
          </div>
        </section>

        {result && (
          <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
            <div className="font-semibold flex items-center gap-2">
              <Icon name="FileSpreadsheet" size={18} className="text-primary" />
              3. Файл для загрузки каталога
            </div>
            <p className="text-xs text-muted-foreground">
              Каждый товар один раз. Цена — из самой поздней накладной; если в ней у товара несколько цен — по выбранному правилу или вручную. Колонки: Артикул, Наименование, Штрихкод,
              Бренд, Вес, Код ТНВЭД, Цена. Синим — артикул, созданный из названия; бренд можно исправить в таблице.
            </p>
            <WaybillResult
              data={result}
              rule={rule}
              picks={picks}
              onRule={(r) => {
                setRule(r);
                setSaved(null);
              }}
              onPick={(key, price) => {
                setSaved(null);
                setPicks((p) => {
                  const n = { ...p };
                  if (price === null) delete n[key];
                  else n[key] = price;
                  return n;
                });
              }}
              brands={brands}
              onBrand={(key, brand) => {
                setSaved(null);
                setBrands((p) => ({ ...p, [key]: brand }));
              }}
              twins={twins}
              writtenKeys={new Set(Object.values(written).filter((r) => r.state === "written").map((r) => r.key))}
              articles={
                <AutoArticles
                  items={result.items}
                  twins={twins}
                  twinsLoading={twinsLoading}
                  written={written}
                  writing={writing}
                  onWrite={writeArts}
                />
              }
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={save} disabled={busy || !result.items.length}>
                <Icon name={saving ? "Loader2" : "Save"} size={16} className={saving ? "animate-spin" : ""} />
                Сохранить в «Файлы от Юры»
              </Button>
              {saved && (
                <Button variant="outline" onClick={() => navigate("/admin/converted-files")}>
                  <Icon name="FolderOpen" size={16} />
                  Открыть «Файлы от Юры»
                </Button>
              )}
            </div>
            {saved && <div className="text-xs text-emerald-400">Сохранён: {saved}</div>}
          </section>
        )}
      </div>
    </ConvertLayout>
  );
};

export default ConvertWaybillCatalog;
