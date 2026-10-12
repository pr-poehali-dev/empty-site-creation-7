import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { findBase } from "./odata/bases";
import {
  InvoiceItem,
  MatchItem,
  MatchStatus,
  ParsedInvoice,
  SEARCH_BY_TITLES,
  SearchBy,
  matchPortion,
  parseInvoice,
} from "./odata/nomenApi";
import NomenMatchTable, { Filter, STATUS_META } from "@/components/odata/NomenMatchTable";

const PORTION = 20;

const NEXT_STEPS = [
  { icon: "ClipboardList", title: "Заполнение новых позиций", hint: "Группа, базовая цена, вес в кг, ТНВЭД по похожим" },
  { icon: "PackagePlus", title: "Создание в 1С", hint: "Карточка, штрихкод и базовая цена" },
  { icon: "FileSpreadsheet", title: "Excel для других баз", hint: "Только новые позиции, FIFO и «Без НДС»" },
];

const OdataNomenclature = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { base = "trade-resurs" } = useParams();
  const baseInfo = findBase(base);
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const fileRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);

  const [parsing, setParsing] = useState(false);
  const [invoice, setInvoice] = useState<ParsedInvoice | null>(null);
  const [by, setBy] = useState<SearchBy>("article");
  const [matches, setMatches] = useState<(MatchItem | null)[]>([]);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (user.role !== "owner") navigate("/admin/dashboard");
  }, []);

  const items: InvoiceItem[] = invoice?.items || [];

  const filled = useMemo(
    () => ({
      article: items.filter((x) => x.article).length,
      barcode: items.filter((x) => x.barcode).length,
      name: items.filter((x) => x.name).length,
    }),
    [items],
  );

  const counts = useMemo(() => {
    const c: Record<MatchStatus, number> = { found: 0, multiple: 0, missing: 0, empty: 0, error: 0 };
    matches.forEach((m) => m && c[m.status]++);
    return c;
  }, [matches]);

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = String(reader.result).split(",")[1];
      setParsing(true);
      setMatches([]);
      setDone(0);
      setFilter("all");
      try {
        const d = await parseInvoice(b64, f.name);
        setInvoice(d);
        const best = (["article", "barcode", "name"] as SearchBy[]).find((k) =>
          d.items.every((x) => x[k]),
        );
        setBy(best || "article");
      } catch (e) {
        setInvoice(null);
        toast({ title: (e as Error).message, variant: "destructive" });
      } finally {
        setParsing(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const runCheck = async () => {
    if (!items.length) return;
    stopRef.current = false;
    setChecking(true);
    setFilter("all");
    const res: (MatchItem | null)[] = items.map(() => null);
    setMatches([...res]);
    setDone(0);
    try {
      for (let i = 0; i < items.length; i += PORTION) {
        if (stopRef.current) break;
        const part = await matchPortion(base, by, items.slice(i, i + PORTION));
        part.forEach((m, j) => (res[i + j] = m));
        setMatches([...res]);
        setDone(Math.min(i + PORTION, items.length));
      }
    } catch (e) {
      toast({ title: "Проверка остановлена", description: (e as Error).message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const reset = () => {
    setInvoice(null);
    setMatches([]);
    setDone(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const checked = matches.some(Boolean) && !checking;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate(`/admin/odata/${base}`)}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold leading-tight truncate">
              Создание номенклатуры в 1С
            </h1>
            <p className="text-xs text-muted-foreground">{baseInfo?.title || base}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4">
        <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
          <div className="font-semibold flex items-center gap-2">
            <Icon name="FileUp" size={18} className="text-primary" />
            1. Счёт поставщика
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {!invoice ? (
            <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
              <Icon name={parsing ? "Loader2" : "Upload"} size={16} className={parsing ? "animate-spin" : ""} />
              {parsing ? "Разбираю счёт…" : "Загрузить счёт Excel"}
            </Button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-sm min-w-0 flex-1">
                <div className="truncate">{invoice.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  Позиций: {items.length} · с артикулом {filled.article} · со штрихкодом {filled.barcode}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={reset} disabled={checking}>
                Другой счёт
              </Button>
            </div>
          )}
        </section>

        {invoice && (
          <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
            <div className="font-semibold flex items-center gap-2">
              <Icon name="Search" size={18} className="text-primary" />
              2. По какому реквизиту искать в 1С?
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SEARCH_BY_TITLES) as SearchBy[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={checking}
                  onClick={() => setBy(k)}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${
                    by === k
                      ? "border-primary bg-primary/10"
                      : "border-white/[0.08] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="text-sm font-medium">{SEARCH_BY_TITLES[k]}</div>
                  <div className="text-xs text-muted-foreground">
                    в счёте {filled[k]} из {items.length}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {checking ? (
                <Button variant="outline" onClick={() => (stopRef.current = true)}>
                  <Icon name="Square" size={14} />
                  Остановить
                </Button>
              ) : (
                <Button onClick={runCheck}>
                  <Icon name="Search" size={16} />
                  {matches.some(Boolean) ? "Проверить заново" : "Проверить в 1С"}
                </Button>
              )}
              {(checking || done > 0) && (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  {checking && <Icon name="Loader2" size={14} className="animate-spin" />}
                  Проверено {done} из {items.length}
                </span>
              )}
            </div>
            {(checking || done > 0) && (
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(done / Math.max(items.length, 1)) * 100}%` }}
                />
              </div>
            )}
          </section>
        )}

        {invoice && (
          <section className="space-y-3">
            {matches.some(Boolean) && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`text-xs rounded-md px-2.5 py-1.5 border ${
                    filter === "all" ? "border-primary bg-primary/10" : "border-white/[0.08]"
                  }`}
                >
                  Все · {items.length}
                </button>
                {(Object.keys(STATUS_META) as MatchStatus[])
                  .filter((s) => counts[s] > 0)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilter(s)}
                      className={`text-xs rounded-md px-2.5 py-1.5 border flex items-center gap-1 ${
                        filter === s ? "border-primary" : "border-white/[0.08]"
                      } ${STATUS_META[s].cls}`}
                    >
                      <Icon name={STATUS_META[s].icon} size={13} />
                      {STATUS_META[s].label} · {counts[s]}
                    </button>
                  ))}
              </div>
            )}
            {checked && counts.multiple > 0 && (
              <div className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
                «Несколько» — в 1С больше одной карточки с этим значением. Такие позиции считаются
                существующими и создаваться не будут. Нажмите на строку, чтобы увидеть карточки.
              </div>
            )}
            <NomenMatchTable items={items} matches={matches} filter={filter} />
          </section>
        )}

        {checked && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
            На создание: <b>{counts.missing}</b> {counts.missing === 1 ? "позиция" : "позиций"}. Заполнение
            реквизитов появится на следующем шаге.
          </div>
        )}

        <div className="space-y-2 pt-2">
          {NEXT_STEPS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-xl border border-white/[0.08] bg-card p-3 flex items-center gap-3 opacity-60"
            >
              <Icon name={s.icon} size={18} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {i + 3}. {s.title}
                </div>
                <div className="text-xs text-muted-foreground">{s.hint}</div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">скоро</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default OdataNomenclature;
