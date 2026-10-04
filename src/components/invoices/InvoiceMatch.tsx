import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import PickList from "@/components/search-dicts/PickList";
import { authHeaders, loadSearchDicts, SEARCH_DICTS_URL, SearchBrand } from "@/components/search-dicts/api";
import MatchRowCard from "./MatchRowCard";
import CreateProducts from "./CreateProducts";
import InvoicePrices from "./InvoicePrices";

const INVOICE_URL = "https://functions.poehali.dev/da75537b-bd2c-4bb3-b3ee-5cd90f17c9a2";

export interface Candidate {
  id: number;
  name: string;
  article: string;
  product_group: string | null;
  brand: string | null;
  price_base: number;
  price_retail: number;
  price_wholesale: number;
  price_purchase: number;
  model?: string | null;
  feature?: string | null;
  search_group?: string | null;
  distance?: number;
}

export type MatchStatus = "matched" | "suggested" | "ambiguous" | "not_found" | "empty" | "manual" | "unparsed" | "created";

export interface MatchRow {
  article: string;
  article_guessed?: boolean;
  name: string;
  qty: number | null;
  price: number | null;
  total: number | null;
  match_status: MatchStatus;
  match_type?: string;
  match_reason?: string;
  product_id?: number;
  chosen_name?: string;
  prev_status?: MatchStatus;
  catalog_features?: string[];
  candidates: Candidate[];
  parsed?: {
    brand: string | null;
    brand_implied: boolean;
    line_word?: string | null;
    group: string | null;
    model: string | null;
    feature: string | null;
  };
}

export interface MatchSummary {
  total: number;
  matched: number;
  suggested?: number;
  ambiguous: number;
  not_found: number;
  empty: number;
  manual: number;
  unparsed?: number;
}

interface Props {
  draftId: number;
  onBack: () => void;
}

type Mode = "article" | "name";

const GROUPS = {
  found: ["matched", "manual", "created"],
  yellow: ["suggested", "ambiguous"],
  red: ["not_found", "empty"],
  gray: ["unparsed"],
} as Record<"found" | "yellow" | "red" | "gray", MatchStatus[]>;

type FilterKey = "all" | "todo" | keyof typeof GROUPS;

const InvoiceMatch = ({ draftId, onBack }: Props) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("article");
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<SearchBrand[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [fromNames, setFromNames] = useState(0);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("");
  const [inNames, setInNames] = useState(false);
  const [tolerance, setTolerance] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("todo");
  const [creating, setCreating] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [brandBusy, setBrandBusy] = useState(false);

  const applyBrand = async (index: number, a: { brandId: number; word: string | null; all: boolean }) => {
    setBrandBusy(true);
    try {
      const idxs = a.all
        ? rows.map((r, i) => (r.parsed?.brand_implied && !["matched", "manual", "created"].includes(r.match_status) ? i : -1)).filter((i) => i >= 0)
        : [index];
      const r = await fetch(`${SEARCH_DICTS_URL}?section=row_brand`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ draft_id: draftId, brand_id: a.brandId, word: a.word, row_indexes: idxs }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRows(d.rows || []);
      setSummary(d.summary || null);
      toast({
        title: a.word
          ? `«${a.word}» запомнено. Разобрано товаров в каталоге: ${d.parsed_count ?? 0}`
          : "Бренд применён, счёт пересопоставлен",
      });
      return true;
    } catch (e) {
      toast({ title: (e as Error).message || "Не удалось применить бренд", variant: "destructive" });
      return false;
    } finally {
      setBrandBusy(false);
    }
  };
  const impliedCount = rows.filter((r) => r.parsed?.brand_implied && !["matched", "manual", "created"].includes(r.match_status)).length;

  const run = useCallback(
    async (opts?: { mode?: Mode; brandId?: string; product_group?: string; search_in_names?: boolean; tolerance?: number }) => {
      const m = opts?.mode ?? mode;
      const tol = opts?.tolerance ?? tolerance;
      setLoading(true);
      try {
        let r: Response;
        if (m === "name") {
          const b = opts?.brandId ?? brandId;
          r = await fetch(`${SEARCH_DICTS_URL}?section=match`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ draft_id: draftId, brand_id: b ? Number(b) : null, tolerance: tol }),
          });
        } else {
          r = await fetch(INVOICE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "match",
              draft_id: draftId,
              product_group: opts?.product_group ?? group,
              search_in_names: opts?.search_in_names ?? inNames,
              tolerance: tol,
            }),
          });
        }
        const d = await r.json();
        if (!r.ok) {
          toast({ title: d.error || "Не удалось сопоставить", variant: "destructive" });
          return;
        }
        setRows(d.rows || []);
        setSummary(d.summary || null);
        setFromNames(d.article_from_name_count || 0);
        if (typeof d.tolerance === "number") setTolerance(d.tolerance);
      } catch {
        toast({ title: "Ошибка сопоставления", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [draftId, mode, brandId, group, inNames, tolerance, toast],
  );

  useEffect(() => {
    (async () => {
      let m: Mode = "article";
      let b = "";
      let t = 0;
      try {
        const [dicts, st] = await Promise.all([
          loadSearchDicts(),
          fetch(`${SEARCH_DICTS_URL}?section=match&draft_id=${draftId}`, { headers: authHeaders() }).then((x) => x.json()),
        ]);
        setBrands(dicts.brands);
        if (st?.mode === "name") m = "name";
        if (st?.brand_id) b = String(st.brand_id);
        if (typeof st?.tolerance === "number") t = st.tolerance;
      } catch { /* ignore */ }
      setMode(m);
      setBrandId(b);
      setTolerance(t);
      run({ mode: m, brandId: b, tolerance: t });
    })();
  }, [draftId]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    run({ mode: m });
  };

  const choose = async (index: number, productId: number | null, name?: string, reset = false) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        if (productId) {
          return {
            ...r,
            prev_status: r.prev_status ?? r.match_status,
            product_id: productId,
            chosen_name: name,
            match_status: "manual",
          };
        }
        const back: MatchStatus = reset && r.candidates.length > 0
          ? (r.prev_status && r.prev_status !== "matched" && r.prev_status !== "manual" ? r.prev_status : "ambiguous")
          : "not_found";
        return { ...r, product_id: undefined, chosen_name: undefined, match_status: back };
      }),
    );
    try {
      await fetch(INVOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_match", draft_id: draftId, row_index: index, product_id: productId, chosen_name: name || null,
        }),
      });
    } catch {
      toast({ title: "Выбор не сохранился", variant: "destructive" });
    }
  };

  const counts = {
    found: rows.filter((r) => GROUPS.found.includes(r.match_status)).length,
    yellow: rows.filter((r) => GROUPS.yellow.includes(r.match_status)).length,
    red: rows.filter((r) => GROUPS.red.includes(r.match_status)).length,
    gray: rows.filter((r) => GROUPS.gray.includes(r.match_status)).length,
  };
  const left = counts.yellow + counts.red + counts.gray;

  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => {
      if (filter === "all") return true;
      if (filter === "todo") return !GROUPS.found.includes(r.match_status);
      return GROUPS[filter].includes(r.match_status);
    });

  const createdCount = rows.filter((r) => r.match_status === "created").length;

  const undo = async (productId?: number) => {
    if (!productId && !confirm(`Отменить создание ${createdCount} товаров из этого счёта? Они уйдут в архив.`)) return;
    setUndoing(true);
    try {
      const qs = new URLSearchParams({ section: "create", draft_id: String(draftId) });
      if (productId) qs.set("product_id", String(productId));
      const r = await fetch(`${SEARCH_DICTS_URL}?${qs}`, { method: "DELETE", headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRows(d.rows || []);
      toast({ title: `Отменено: ${d.undone}` });
    } catch (e) {
      toast({ title: (e as Error).message || "Не удалось отменить", variant: "destructive" });
    } finally {
      setUndoing(false);
    }
  };

  const toggle = (f: FilterKey) => setFilter(filter === f ? "all" : f);

  if (pricing) {
    return <InvoicePrices draftId={draftId} onBack={() => setPricing(false)} />;
  }

  if (creating) {
    return (
      <CreateProducts
        draftId={draftId}
        onBack={() => setCreating(false)}
        onDone={() => { setCreating(false); run(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <Icon name="ArrowLeft" size={20} />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Сопоставление с каталогом</h2>
          <p className="text-sm text-muted-foreground">Строк в счёте: {summary?.total ?? 0}</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Искать по:</span>
          <div className="inline-flex rounded-xl border border-white/[0.08] p-0.5 bg-secondary">
            {(["article", "name"] as Mode[]).map((m) => (
              <button
                key={m}
                disabled={loading}
                onClick={() => switchMode(m)}
                className={`px-3 h-8 rounded-lg text-sm transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "article" ? "Артикулу" : "Наименованию"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Сравнение:</span>
          <div className="inline-flex rounded-xl border border-white/[0.08] p-0.5 bg-secondary">
            {[0, 1, 2].map((t) => (
              <button
                key={t}
                disabled={loading}
                onClick={() => { if (t !== tolerance) { setTolerance(t); run({ tolerance: t }); } }}
                className={`px-3 h-8 rounded-lg text-sm transition-colors ${tolerance === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t === 0 ? "Точно" : t === 1 ? "Допуск 1 знак" : "Допуск 2 знака"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground w-full">
            {tolerance === 0
              ? "Нет точного совпадения — строка сразу идёт в создание новых товаров."
              : `Отличия до ${tolerance} ${tolerance === 1 ? "знака" : "знаков"} предлагаются на выбор, остальное — в создание.`}
            {" "}Регистр, пробелы, точки, дефисы и «б/у» не учитываются. Запоминается за поставщиком.
          </p>
        </div>

        {mode === "name" && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-full sm:w-64">
                <PickList
                  value={brandId}
                  onChange={(v) => { setBrandId(v); run({ brandId: v }); }}
                  placeholder="Бренд счёта не выбран"
                  extra={[{ value: "", label: "Не выбран" }]}
                  options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Наименование из счёта разбирается так же, как карточки каталога: группа, бренд, модель, признак.
              Если бренда в строке нет — берётся бренд счёта.
            </p>
          </div>
        )}
      </div>

      {mode === "article" && fromNames > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <div className="flex gap-2">
            <Icon name="TriangleAlert" size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-300">В счёте нет колонки с артикулом</p>
              <p className="text-muted-foreground mt-1">
                Артикулы вычислены из наименований — таких строк {fromNames}. Попробуйте поиск по наименованию.
              </p>
            </div>
          </div>
          {!inNames && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={loading}
              onClick={() => { setInNames(true); run({ search_in_names: true }); }}
            >
              <Icon name="Search" size={14} />
              <span className="ml-2">Расширить поиск на наименования</span>
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          ["found", "Найдено", counts.found, "text-emerald-400", "border-emerald-500"],
          ["yellow", tolerance > 0 ? "Предложено / выбор" : "Нужен выбор", counts.yellow, "text-amber-400", "border-amber-500"],
          ["red", "Не найдено", counts.red, "text-rose-400", "border-rose-500"],
          ["gray", "Бренд не разобран", counts.gray, "", "border-white/40"],
        ] as [FilterKey, string, number, string, string][])
          .filter(([k]) => k !== "gray" || mode === "name")
          .map(([k, label, n, color, active]) => (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={`rounded-xl border p-3 text-left transition-colors ${filter === k ? `${active} bg-white/[0.04]` : "border-white/[0.08] hover:bg-white/[0.03]"}`}
            >
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {label}
                {filter === k && <Icon name="Filter" size={11} />}
              </p>
              <p className={`text-xl font-semibold ${color}`}>{n}</p>
            </button>
          ))}
      </div>

      {counts.found > 0 && !loading && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
          <p className="text-sm flex-1 min-w-[200px]">
            Сопоставлено товаров: {counts.found}{left > 0 ? `. Ещё ${left} строк без товара — в ценах их не будет.` : "."}
          </p>
          <Button className="rounded-xl" onClick={() => setPricing(true)}>
            <span>Дальше: цены</span>
            <Icon name="ArrowRight" size={16} className="ml-2" />
          </Button>
        </div>
      )}

      {(counts.red > 0 || createdCount > 0) && !loading && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] p-3">
          {counts.red > 0 && (
            <Button className="rounded-xl" onClick={() => setCreating(true)}>
              <Icon name="PackagePlus" size={16} />
              <span className="ml-2">Создать новые товары ({counts.red})</span>
            </Button>
          )}
          {createdCount > 0 && (
            <Button variant="outline" className="rounded-xl" disabled={undoing} onClick={() => undo()}>
              <Icon name="Undo2" size={16} />
              <span className="ml-2">Отменить создание товаров из этого счёта ({createdCount})</span>
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {mode === "article" && (
          <Input
            placeholder="Сузить до группы товаров"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="w-56 rounded-xl"
          />
        )}
        <Button variant="outline" className="rounded-xl" disabled={loading} onClick={() => run()}>
          <Icon name="RefreshCw" size={14} />
          <span className="ml-2">Искать заново</span>
        </Button>
        <Button
          variant={filter === "all" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => setFilter("all")}
        >
          Все строки ({rows.length})
        </Button>
        <Button
          variant={filter === "todo" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => setFilter("todo")}
        >
          Требуют внимания ({left})
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Icon name="Loader" size={24} className="animate-spin mx-auto mb-2" />
          Ищу товары в каталоге
        </div>
      ) : visible.length === 0 ? (
        <div className="py-12 text-center">
          <Icon name="CircleCheck" size={32} className="text-emerald-400 mx-auto mb-2" />
          <p className="font-medium">{left === 0 ? "Все строки опознаны" : "В этом фильтре строк нет"}</p>
          {left > 0 && (
            <Button variant="outline" className="rounded-xl mt-3" onClick={() => setFilter("todo")}>
              Показать требующие внимания ({left})
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(({ r, i }) => (
            <MatchRowCard
              key={i}
              row={r}
              mode={mode}
              brandId={brandId}
              onChoose={(pid, name) => choose(i, pid, name, pid === null && GROUPS.found.includes(r.match_status))}
              onUndo={() => r.product_id && undo(r.product_id)}
              brands={brands}
              impliedCount={impliedCount}
              brandBusy={brandBusy}
              onBrand={(a) => applyBrand(i, a)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoiceMatch;