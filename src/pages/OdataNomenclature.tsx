import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { findBase } from "./odata/bases";
import {
  BarcodeState,
  BarcodeWriteResult,
  InvoiceItem,
  MatchItem,
  MatchOptions,
  MatchStatus,
  ParsedInvoice,
  SearchBy,
  addBarcodesPortion,
  matchPortion,
  parseInvoice,
} from "./odata/nomenApi";
import NomenMatchTable, { BC_META, Filter, STATUS_META } from "@/components/odata/NomenMatchTable";
import NomenSearchOptions from "@/components/odata/NomenSearchOptions";
import NomenBarcodePanel from "@/components/odata/NomenBarcodePanel";

const WRITE_PORTION = 10;

const NEXT_STEPS = [
  { icon: "ClipboardList", title: "Заполнение новых позиций", hint: "Группа, базовая цена, вес в кг, ТНВЭД по похожим" },
  { icon: "PackagePlus", title: "Создание в 1С", hint: "Карточка, штрихкод и базовая цена" },
  { icon: "FileSpreadsheet", title: "Excel для других баз", hint: "Только новые позиции, FIFO и «Без НДС»" },
];

const emptyBc = (): Record<BarcodeState, number> => ({
  ok: 0, none: 0, other: 0, taken: 0, no_invoice: 0, error: 0,
});

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
  const [opts, setOpts] = useState<MatchOptions>({
    mode: "single",
    by: "article",
    exact: true,
    checkBarcodes: false,
  });
  const [usedOpts, setUsedOpts] = useState<MatchOptions | null>(null);
  const [matches, setMatches] = useState<(MatchItem | null)[]>([]);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [writing, setWriting] = useState(false);
  const [writeProgress, setWriteProgress] = useState({ done: 0, total: 0 });
  const [writeResults, setWriteResults] = useState<BarcodeWriteResult[] | null>(null);

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
    const c: Record<MatchStatus, number> = {
      found: 0, multiple: 0, partial: 0, missing: 0, empty: 0, error: 0,
    };
    matches.forEach((m) => m && c[m.status]++);
    return c;
  }, [matches]);

  const bcCounts = useMemo(() => {
    const c = emptyBc();
    matches.forEach((m) => m?.bc && c[m.bc.state]++);
    return c;
  }, [matches]);

  const portion = opts.mode === "all" || opts.checkBarcodes ? 10 : 20;

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = String(reader.result).split(",")[1];
      setParsing(true);
      setMatches([]);
      setDone(0);
      setFilter("all");
      setWriteResults(null);
      try {
        const d = await parseInvoice(b64, f.name);
        setInvoice(d);
        const best = (["article", "barcode", "name"] as SearchBy[]).find((k) =>
          d.items.every((x) => x[k]),
        );
        setOpts((o) => ({ ...o, by: best || "article" }));
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
    setWriteResults(null);
    setUsedOpts(opts);
    const res: (MatchItem | null)[] = items.map(() => null);
    setMatches([...res]);
    setDone(0);
    try {
      for (let i = 0; i < items.length; i += portion) {
        if (stopRef.current) break;
        const part = await matchPortion(base, opts, items.slice(i, i + portion));
        part.forEach((m, j) => (res[i + j] = m));
        setMatches([...res]);
        setDone(Math.min(i + portion, items.length));
      }
    } catch (e) {
      toast({ title: "Проверка остановлена", description: (e as Error).message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const writeBarcodes = async (includeOther: boolean) => {
    const targets = matches
      .map((m, i) => ({ m, it: items[i] }))
      .filter(
        ({ m }) =>
          m?.card_key && (m.bc?.state === "none" || (includeOther && m.bc?.state === "other")),
      )
      .map(({ m, it }) => ({ key: m!.card_key!, barcode: it.barcode }));
    if (!targets.length) return;
    setWriting(true);
    setWriteResults(null);
    setWriteProgress({ done: 0, total: targets.length });
    const all: BarcodeWriteResult[] = [];
    try {
      for (let i = 0; i < targets.length; i += WRITE_PORTION) {
        const part = await addBarcodesPortion(base, targets.slice(i, i + WRITE_PORTION));
        all.push(...part);
        setWriteProgress({ done: Math.min(i + WRITE_PORTION, targets.length), total: targets.length });
      }
    } catch (e) {
      toast({ title: "Запись остановлена", description: (e as Error).message, variant: "destructive" });
    } finally {
      const byKey = new Map(all.map((r) => [r.key + "|" + r.barcode, r]));
      setMatches((prev) =>
        prev.map((m, i) => {
          if (!m?.card_key || !m.bc) return m;
          const r = byKey.get(m.card_key + "|" + items[i].barcode);
          if (!r) return m;
          if (r.state === "added" || r.state === "exists") {
            return { ...m, bc: { ...m.bc, state: "ok", have: [...(m.bc.have || []), items[i].barcode] } };
          }
          if (r.state === "taken") return { ...m, bc: { ...m.bc, state: "taken", owner: r.owner } };
          return { ...m, bc: { ...m.bc, state: "error", error: r.error } };
        }),
      );
      setWriteResults(all);
      setWriting(false);
    }
  };

  const reset = () => {
    setInvoice(null);
    setMatches([]);
    setDone(0);
    setWriteResults(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const hasResults = matches.some(Boolean);
  const checked = hasResults && !checking;
  const busy = checking || writing;

  const chip = (key: Filter, label: string, cls: string, icon?: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      className={`text-xs rounded-md px-2.5 py-1.5 border flex items-center gap-1 ${
        filter === key ? "border-primary" : "border-white/[0.08]"
      } ${cls}`}
    >
      {icon && <Icon name={icon} size={13} />}
      {label}
    </button>
  );

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
              <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
                Другой счёт
              </Button>
            </div>
          )}
        </section>

        {invoice && (
          <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
            <div className="font-semibold flex items-center gap-2">
              <Icon name="Search" size={18} className="text-primary" />
              2. Как искать в 1С
            </div>
            <NomenSearchOptions
              opts={opts}
              onChange={setOpts}
              filled={filled}
              total={items.length}
              disabled={busy}
            />
            <div className="flex items-center gap-3 flex-wrap">
              {checking ? (
                <Button variant="outline" onClick={() => (stopRef.current = true)}>
                  <Icon name="Square" size={14} />
                  Остановить
                </Button>
              ) : (
                <Button onClick={runCheck} disabled={writing}>
                  <Icon name="Search" size={16} />
                  {hasResults ? "Проверить заново" : "Проверить в 1С"}
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

        {checked && usedOpts?.checkBarcodes && (
          <NomenBarcodePanel
            counts={bcCounts}
            writing={writing}
            progress={writeProgress}
            results={writeResults}
            onWrite={writeBarcodes}
          />
        )}

        {invoice && (
          <section className="space-y-3">
            {hasResults && (
              <div className="flex flex-wrap gap-2">
                {chip("all", `Все · ${items.length}`, "")}
                {(Object.keys(STATUS_META) as MatchStatus[])
                  .filter((s) => counts[s] > 0)
                  .map((s) =>
                    chip(s, `${STATUS_META[s].label} · ${counts[s]}`, STATUS_META[s].cls, STATUS_META[s].icon),
                  )}
                {usedOpts?.checkBarcodes &&
                  (["none", "other", "taken"] as BarcodeState[])
                    .filter((s) => bcCounts[s] > 0)
                    .map((s) =>
                      chip(`bc_${s}` as Filter, `${BC_META[s].label} · ${bcCounts[s]}`, BC_META[s].cls),
                    )}
              </div>
            )}
            {checked && (counts.multiple > 0 || counts.partial > 0) && (
              <div className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 space-y-1">
                {counts.multiple > 0 && (
                  <p>«Несколько» — в 1С больше одной подходящей карточки.</p>
                )}
                {counts.partial > 0 && (
                  <p>
                    «Частично» — часть реквизитов совпала, но не все у одной карточки. Значки А / Ш / Н
                    показывают, что нашлось.
                  </p>
                )}
                <p>Такие позиции не создаются, чтобы не было дублей. Нажмите на строку, чтобы увидеть карточки.</p>
              </div>
            )}
            <NomenMatchTable
              items={items}
              matches={matches}
              filter={filter}
              showHits={usedOpts?.mode === "all"}
            />
          </section>
        )}

        {checked && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
            На создание: <b>{counts.missing}</b> — только позиции «Нет в 1С». Заполнение реквизитов
            появится на следующем шаге.
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
