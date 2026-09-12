import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

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
}

export interface MatchRow {
  article: string;
  article_guessed?: boolean;
  name: string;
  qty: number | null;
  price: number | null;
  total: number | null;
  match_status: "matched" | "ambiguous" | "not_found" | "empty" | "manual";
  match_type?: string;
  product_id?: number;
  candidates: Candidate[];
}

export interface MatchSummary {
  total: number;
  matched: number;
  ambiguous: number;
  not_found: number;
  empty: number;
  manual: number;
}

interface Props {
  draftId: number;
  onBack: () => void;
}

const money = (v: number) =>
  v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const InvoiceMatch = ({ draftId, onBack }: Props) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [fromNames, setFromNames] = useState(0);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("");
  const [inNames, setInNames] = useState(false);
  const [filter, setFilter] = useState<"todo" | "all">("todo");

  const run = useCallback(
    async (opts?: { product_group?: string; search_in_names?: boolean }) => {
      setLoading(true);
      try {
        const r = await fetch(INVOICE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "match",
            draft_id: draftId,
            product_group: opts?.product_group ?? group,
            search_in_names: opts?.search_in_names ?? inNames,
          }),
        });
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
    [draftId, group, inNames, toast],
  );

  useEffect(() => {
    run();
     
  }, [draftId]);

  const choose = async (index: number, productId: number | null) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
              ...r,
              product_id: productId ?? undefined,
              match_status: productId ? "manual" : "not_found",
            }
          : r,
      ),
    );
    try {
      await fetch(INVOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_match",
          draft_id: draftId,
          row_index: index,
          product_id: productId,
        }),
      });
    } catch {
      toast({ title: "Выбор не сохранился", variant: "destructive" });
    }
  };

  const needsWork = (r: MatchRow) =>
    r.match_status === "ambiguous" || r.match_status === "not_found" || r.match_status === "empty";

  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (filter === "all" ? true : needsWork(r)));

  const done = summary ? summary.matched + summary.manual : 0;
  const left = summary ? summary.ambiguous + summary.not_found + summary.empty : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <Icon name="ArrowLeft" size={20} />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Сопоставление с каталогом</h2>
          <p className="text-sm text-muted-foreground">
            Строк в счёте: {summary?.total ?? 0}
          </p>
        </div>
      </div>

      {fromNames > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <div className="flex gap-2">
            <Icon name="TriangleAlert" size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-300">
                В счёте нет колонки с артикулом
              </p>
              <p className="text-muted-foreground mt-1">
                Артикулы вычислены из наименований — таких строк {fromNames}. Если товары
                не находятся, попробуйте искать артикул ещё и в тексте названий каталога.
              </p>
            </div>
          </div>
          {!inNames && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={loading}
              onClick={() => {
                setInNames(true);
                run({ search_in_names: true });
              }}
            >
              <Icon name="Search" size={14} />
              <span className="ml-2">Расширить поиск на наименования</span>
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-white/[0.08] p-3">
          <p className="text-xs text-muted-foreground">Найдено</p>
          <p className="text-xl font-semibold text-emerald-400">{done}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] p-3">
          <p className="text-xs text-muted-foreground">Нужен выбор</p>
          <p className="text-xl font-semibold text-amber-400">{summary?.ambiguous ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] p-3">
          <p className="text-xs text-muted-foreground">Не найдено</p>
          <p className="text-xl font-semibold text-rose-400">{summary?.not_found ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] p-3">
          <p className="text-xs text-muted-foreground">Без артикула</p>
          <p className="text-xl font-semibold">{summary?.empty ?? 0}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Сузить до группы товаров"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="w-56 rounded-xl"
        />
        <Button
          variant="outline"
          className="rounded-xl"
          disabled={loading}
          onClick={() => run()}
        >
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
            <div key={i} className="rounded-xl border border-white/[0.08] p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-sm">{r.article || "без артикула"}</span>
                {r.article_guessed && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                    из наименования
                  </span>
                )}
                <span className="text-sm text-muted-foreground flex-1">{r.name}</span>
                <span className="text-sm">
                  {r.qty ?? 0} × {money(r.price ?? 0)}
                </span>
              </div>

              {r.match_status === "ambiguous" && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Несколько подходящих — выберите нужный:
                  </p>
                  {r.candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => choose(i, c.id)}
                      className="w-full text-left rounded-lg border border-white/[0.08] px-3 py-2 hover:bg-white/[0.04] transition"
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-xs">{c.article}</span>
                        <span className="text-sm flex-1">{c.name}</span>
                        {c.product_group && (
                          <span className="text-[11px] text-muted-foreground">
                            {c.product_group}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {(r.match_status === "not_found" || r.match_status === "empty") && (
                <p className="mt-2 text-sm text-rose-400">
                  {r.match_status === "empty"
                    ? "Артикул не определён"
                    : "В каталоге не найден — карточку создадим на следующем шаге"}
                </p>
              )}

              {r.match_status === "manual" && (
                <p className="mt-2 text-sm text-emerald-400">Выбран вручную</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoiceMatch;
