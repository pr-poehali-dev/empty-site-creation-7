import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import PickList from "@/components/search-dicts/PickList";
import { authHeaders, loadSearchDicts, SEARCH_DICTS_URL, SearchBrand } from "@/components/search-dicts/api";
import MatchRowCard from "./MatchRowCard";

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

export type MatchStatus = "matched" | "suggested" | "ambiguous" | "not_found" | "empty" | "manual" | "unparsed";

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
  candidates: Candidate[];
  parsed?: {
    brand: string | null;
    brand_implied: boolean;
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
  const [filter, setFilter] = useState<"todo" | "all">("todo");

  const run = useCallback(
    async (opts?: { mode?: Mode; brandId?: string; product_group?: string; search_in_names?: boolean }) => {
      const m = opts?.mode ?? mode;
      setLoading(true);
      try {
        let r: Response;
        if (m === "name") {
          const b = opts?.brandId ?? brandId;
          r = await fetch(`${SEARCH_DICTS_URL}?section=match`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ draft_id: draftId, brand_id: b ? Number(b) : null }),
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
      } catch {
        toast({ title: "Ошибка сопоставления", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [draftId, mode, brandId, group, inNames, toast],
  );

  useEffect(() => {
    (async () => {
      let m: Mode = "article";
      let b = "";
      try {
        const [dicts, st] = await Promise.all([
          loadSearchDicts(),
          fetch(`${SEARCH_DICTS_URL}?section=match&draft_id=${draftId}`, { headers: authHeaders() }).then((x) => x.json()),
        ]);
        setBrands(dicts.brands);
        if (st?.mode === "name") m = "name";
        if (st?.brand_id) b = String(st.brand_id);
      } catch { /* ignore */ }
      setMode(m);
      setBrandId(b);
      run({ mode: m, brandId: b });
    })();
  }, [draftId]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    run({ mode: m });
  };

  const choose = async (index: number, productId: number | null) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, product_id: productId ?? undefined, match_status: productId ? "manual" : "not_found" }
          : r,
      ),
    );
    try {
      await fetch(INVOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_match", draft_id: draftId, row_index: index, product_id: productId }),
      });
    } catch {
      toast({ title: "Выбор не сохранился", variant: "destructive" });
    }
  };

  const needsWork = (r: MatchRow) =>
    ["ambiguous", "suggested", "not_found", "empty", "unparsed"].includes(r.match_status);

  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (filter === "all" ? true : needsWork(r)));

  const done = summary ? summary.matched + summary.manual : 0;
  const left = rows.filter(needsWork).length;
  const yellow = summary ? (summary.ambiguous || 0) + (summary.suggested || 0) : 0;

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

      <div className={`grid grid-cols-2 ${mode === "name" ? "sm:grid-cols-4" : "sm:grid-cols-4"} gap-2`}>
        <div className="rounded-xl border border-white/[0.08] p-3">
          <p className="text-xs text-muted-foreground">Найдено</p>
          <p className="text-xl font-semibold text-emerald-400">{done}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] p-3">
          <p className="text-xs text-muted-foreground">{mode === "name" ? "Предложено / выбор" : "Нужен выбор"}</p>
          <p className="text-xl font-semibold text-amber-400">{mode === "name" ? yellow : summary?.ambiguous ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] p-3">
          <p className="text-xs text-muted-foreground">Не найдено</p>
          <p className="text-xl font-semibold text-rose-400">{summary?.not_found ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] p-3">
          <p className="text-xs text-muted-foreground">{mode === "name" ? "Бренд не разобран" : "Без артикула"}</p>
          <p className="text-xl font-semibold">{mode === "name" ? summary?.unparsed ?? 0 : summary?.empty ?? 0}</p>
        </div>
      </div>

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
          variant={filter === "todo" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => setFilter(filter === "todo" ? "all" : "todo")}
        >
          {filter === "todo" ? "Показать все строки" : "Только требующие внимания"}
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
          <p className="font-medium">Все строки опознаны</p>
          <p className="text-sm text-muted-foreground mt-1">
            {left === 0 ? "Ручной выбор не потребовался" : "Остались только решённые"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(({ r, i }) => (
            <MatchRowCard key={i} row={r} mode={mode} onChoose={(pid) => choose(i, pid)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoiceMatch;
