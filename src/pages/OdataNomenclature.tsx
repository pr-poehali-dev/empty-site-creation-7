import { useEffect, useMemo, useRef, useState } from "react";
import NomenRequisites, { COMMON_REQUISITES } from "@/components/odata/NomenRequisites";
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
  Group1C,
  NewItem,
  TnvedKind,
  Country1C,
  addBarcodesPortion,
  loadGroups,
  loadTnvedPortion,
  TnvedResult,
  matchPortion,
  parseInvoice,
  productKind,
  CreateResult,
  PriceDocResult,
  createPortion,
  newItemProblems,
  setBasePrices,
  toNumber,
  ConflictCard,
  Decision,
  attachBarcode,
  avgWeight,
  fmtWeight,
  similarWeights,
  countryByName,
  checkTnvedCodes,
} from "./odata/nomenApi";
import NomenCategories, { guessCategoryColumn, suggestExcluded } from "@/components/odata/NomenCategories";
import NomenTnvedSteps, { TnvedStep } from "@/components/odata/NomenTnvedSteps";

const CHECK_PORTION = 15;
const SIMILAR_PORTION = 4;
import NomenMatchTable, { BC_META, Filter, STATUS_META } from "@/components/odata/NomenMatchTable";
import NomenSearchOptions from "@/components/odata/NomenSearchOptions";
import NomenBarcodePanel from "@/components/odata/NomenBarcodePanel";
import NomenNewItems from "@/components/odata/NomenNewItems";
import NomenCreatePanel from "@/components/odata/NomenCreatePanel";
import NomenDecisions from "@/components/odata/NomenDecisions";
import NomenExcelPanel from "@/components/odata/NomenExcelPanel";
import { rowsForExcel } from "./odata/nomenExcel";

const WRITE_PORTION = 10;

const NEXT_STEPS = [
  { icon: "FileSpreadsheet", title: "Excel для других баз", hint: "Появится, когда карточки будут созданы в 1С" },
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
  const [retryNote, setRetryNote] = useState("");
  const [resumeFrom, setResumeFrom] = useState<number | null>(null);
  const resRef = useRef<(MatchItem | null)[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [writing, setWriting] = useState(false);
  const [writeProgress, setWriteProgress] = useState({ done: 0, total: 0 });
  const [writeResults, setWriteResults] = useState<BarcodeWriteResult[] | null>(null);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [groups, setGroups] = useState<Group1C[]>([]);
  const [tnved, setTnved] = useState<Record<string, TnvedKind>>({});
  const [countries, setCountries] = useState<Country1C[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);
  const [tnvedFound, setTnvedFound] = useState<Record<string, string>>({});
  const [tnvedMissing, setTnvedMissing] = useState<string[]>([]);
  const [tnvedFailed, setTnvedFailed] = useState<string[]>([]);
  const [kindsFailed, setKindsFailed] = useState<string[]>([]);
  const [step, setStep] = useState<TnvedStep>({ stage: "", done: 0, total: 0, retry: 0 });
  const [createResults, setCreateResults] = useState<Record<number, CreateResult>>({});
  const [priceDocs, setPriceDocs] = useState<PriceDocResult[]>([]);
  const [pricedKeys, setPricedKeys] = useState<string[]>([]);
  const [priceDocByKey, setPriceDocByKey] = useState<Record<string, string>>({});
  const [pricing, setPricing] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [decidingIdx, setDecidingIdx] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState({ done: 0, total: 0, stage: "" });

  useEffect(() => {
    if (user.role !== "owner") navigate("/admin/dashboard");
  }, []);

  const [catCol, setCatCol] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const allItems: InvoiceItem[] = useMemo(() => invoice?.items || [], [invoice]);
  const catOf = (x: InvoiceItem) => (catCol === null ? "" : (x.cells?.[catCol] || "").trim()) || "—";
  const items: InvoiceItem[] = useMemo(
    () => (catCol === null || !excluded.size ? allItems : allItems.filter((x) => !excluded.has(catOf(x)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allItems, catCol, excluded],
  );

  const filled = useMemo(
    () => ({
      article: items.filter((x) => x.article).length,
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
      setResumeFrom(null);
      setDone(0);
      setFilter("all");
      setWriteResults(null);
      try {
        const d = await parseInvoice(b64, f.name);
        setInvoice(d);
        const col = guessCategoryColumn(d.columns || []);
        setCatCol(col);
        setExcluded(suggestExcluded(d.items, col));
        const best = (["article", "name"] as SearchBy[]).find((k) =>
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
    if (unpriced && !window.confirm(`У ${unpriced} созданных карточек нет базовой цены. Всё равно проверить заново?`)) return;
    stopRef.current = false;
    setChecking(true);
    setFilter("all");
    setWriteResults(null);
    setUsedOpts(opts);
    const res: (MatchItem | null)[] = items.map(() => null);
    setMatches([...res]);
    setDone(0);
    setNewItems([]);
    setCreateResults({});
    setPriceDocs([]);
    setPricedKeys([]);
    setPriceDocByKey({});
    setDecisions({});
    resRef.current = res;
    await runFrom(0, opts);
  };

  const runFrom = async (start: number, o: MatchOptions) => {
    const res = resRef.current;
    stopRef.current = false;
    setChecking(true);
    setResumeFrom(null);
    setRetryNote("");
    let complete = false;
    let i = start;
    try {
      for (; i < items.length; i += portion) {
        if (stopRef.current) break;
        const part = await matchPortion(base, o, items.slice(i, i + portion), (n) =>
          setRetryNote(`Слабая связь, повторяю… (${n} из 3)`),
        );
        setRetryNote("");
        part.forEach((m, j) => (res[i + j] = m));
        setMatches([...res]);
        setDone(Math.min(i + portion, items.length));
      }
      complete = !stopRef.current;
      if (stopRef.current && i < items.length) setResumeFrom(i);
    } catch (e) {
      setResumeFrom(i);
      toast({ title: "Проверка прервалась", description: `${(e as Error).message}. Нажмите «Продолжить».`, variant: "destructive" });
    } finally {
      setRetryNote("");
      setChecking(false);
      if (complete) prepareNew(res);
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

  const loadRefs = async () => {
    setRefsLoading(true);
    try {
      const g = await loadGroups(base);
      const brands = g.map((x) => x.name);
      setGroups(g);
      setNewItems((prev) => prev.map((x) => ({ ...x, kind: productKind(x.name, brands) })));
    } catch (e) {
      toast({ title: "Не загрузил группы", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRefsLoading(false);
    }
  };

  const prepareNew = (res: (MatchItem | null)[]) => {
    const list: NewItem[] = res
      .map((m, i) => ({ m, it: items[i], i }))
      .filter(({ m }) => m?.status === "missing")
      .map(({ it, i }) => ({
        idx: i,
        category: catCol === null ? undefined : catOf(it),
        article: it.article,
        barcode: it.barcode,
        name: it.name,
        invoicePrice: it.price,
        kind: productKind(it.name),
        groupKey: "",
        price: "",
        weight: it.weight && it.weight > 0 ? fmtWeight(it.weight) : "",
        weightAuto: false,
        weightSrc: it.weight && it.weight > 0 ? ("file" as const) : undefined,
        countryKey: "",
        countryTouched: false,
        fileCountry: it.country || "",
        fileWeight: it.weight && it.weight > 0 ? fmtWeight(it.weight) : undefined,
        fileTnved: /^\d{10}$/.test(it.tnved || "") ? it.tnved : undefined,
        tnved: "",
        tnvedKey: "",
      }));
    setNewItems(list);
    setTnved({});
    setTnvedFound({});
    setTnvedMissing([]);
    setTnvedFailed([]);
    setKindsFailed([]);
    if (list.length) loadRefs();
  };

  const tnvedCodesKey = useMemo(
    () => Array.from(new Set(newItems.filter((x) => !x.skip).map((x) => x.tnved.trim()).filter((c) => /^\d{10}$/.test(c)))).sort().join(","),
    [newItems],
  );

  useEffect(() => {
    setNewItems((prev) => {
      let changed = false;
      const next = prev.map((x) => {
        const c = x.tnved.trim();
        const miss = /^\d{10}$/.test(c) && tnvedMissing.includes(c);
        const key = tnvedFound[c];
        const patch: Partial<NewItem> = {};
        if (!!x.tnvedMissing !== miss) patch.tnvedMissing = miss;
        if (key && x.tnvedKey !== key) patch.tnvedKey = key;
        if (!Object.keys(patch).length) return x;
        changed = true;
        return { ...x, ...patch };
      });
      return changed ? next : prev;
    });
  }, [tnvedFound, tnvedMissing, tnvedCodesKey]);

  const fileCodes = useMemo(
    () => Array.from(new Set(newItems.filter((x) => !x.skip).map((x) => x.fileTnved || "").filter(Boolean))).sort(),
    [newItems],
  );

  const missingTnvedList = useMemo(() => {
    const pending = newItems.filter((x) => !x.skip && (!createResults[x.idx] || createResults[x.idx].state === "error"));
    return tnvedMissing
      .map((code) => ({
        code,
        count: pending.filter((x) => x.fileTnved === code || x.tnved.trim() === code).length,
      }))
      .filter((m) => m.count > 0);
  }, [tnvedMissing, newItems, createResults]);

  const onTnvedCreated = (map: Record<string, string>) => {
    setTnvedFound((p) => ({ ...p, ...map }));
    setTnvedMissing((p) => p.filter((c) => !map[c]));
  };

  const setRetry = (a: number) => setStep((s) => ({ ...s, retry: a }));

  const checkFileCodes = async () => {
    const todo = fileCodes.filter((c) => !tnvedFound[c] && !tnvedMissing.includes(c));
    setTnvedFailed([]);
    setStep({ stage: "check", done: 0, total: todo.length, retry: 0 });
    const failed: string[] = [];
    for (let i = 0; i < todo.length; i += CHECK_PORTION) {
      const part = todo.slice(i, i + CHECK_PORTION);
      try {
        const r = await checkTnvedCodes(base, part, setRetry);
        setTnvedFound((p) => ({ ...p, ...r.found }));
        setTnvedMissing((p) => Array.from(new Set([...p.filter((c) => !r.found[c]), ...r.missing])));
      } catch {
        failed.push(...part);
      }
      setStep((s) => ({ ...s, done: s.done + part.length, retry: 0 }));
    }
    setTnvedFailed(failed);
    setStep((s) => ({ ...s, stage: "" }));
  };

  const applyFileCodes = () =>
    setNewItems((prev) =>
      prev.map((x) =>
        x.fileTnved && tnvedFound[x.fileTnved] && (!x.tnved || x.tnvedSrc !== undefined)
          ? { ...x, tnved: x.fileTnved, tnvedKey: tnvedFound[x.fileTnved], tnvedSrc: "file" as const }
          : x,
      ),
    );

  const similarTargets = newItems.filter((x) => !x.skip && x.kind && (!x.fileTnved || !x.fileWeight));
  const similarKinds = Array.from(new Set(similarTargets.map((x) => x.kind))).sort();

  const applySimilar = (t: TnvedResult) =>
    setNewItems((prev) =>
      prev.map((x) => {
        const k = x.kind ? t.kinds[x.kind] : undefined;
        if (!k) return x;
        let y = x;
        const best = k.options?.[0];
        if (!x.fileTnved && best && (!x.tnved || x.tnvedSrc === "similar"))
          y = { ...y, tnved: best.code, tnvedKey: best.key, tnvedSrc: "similar" };
        if (!x.fileWeight && (!x.weight.trim() || x.weightAuto)) {
          const avg = avgWeight(similarWeights(x.name, k.weights));
          y = avg > 0 ? { ...y, weight: fmtWeight(avg), weightAuto: true, weightSrc: undefined } : y;
        }
        const fileC = k.country ? countryByName(x.fileCountry, t.countries) : undefined;
        if (fileC && !(x.countryTouched && x.countrySrc !== "file"))
          y = { ...y, countryKey: fileC.key, countryTouched: true, countrySrc: "file" };
        else if (k.country && !x.countryTouched) y = { ...y, countryKey: k.country.options?.[0]?.key || "" };
        return y;
      }),
    );

  const runSimilar = async () => {
    const todo = similarKinds.filter((k) => !tnved[k]);
    setKindsFailed([]);
    setStep({ stage: "similar", done: 0, total: todo.length, retry: 0 });
    const failed: string[] = [];
    for (let i = 0; i < todo.length; i += SIMILAR_PORTION) {
      const part = todo.slice(i, i + SIMILAR_PORTION);
      try {
        const t = await loadTnvedPortion(base, part, setRetry);
        setTnved((p) => ({ ...p, ...t.kinds }));
        if (t.countries.length) setCountries(t.countries);
        applySimilar(t);
      } catch {
        failed.push(...part);
      }
      setStep((s) => ({ ...s, done: s.done + part.length, retry: 0 }));
    }
    setKindsFailed(failed);
    setStep((s) => ({ ...s, stage: "" }));
  };

  const patchNew = (idx: number, patch: Partial<NewItem>) =>
    setNewItems((prev) => prev.map((x) => (x.idx === idx ? { ...x, ...patch } : x)));

  const patchAll = (patch: Partial<NewItem>) => setNewItems((prev) => prev.map((x) => ({ ...x, ...patch })));

  const pendingAll = newItems.filter((x) => !createResults[x.idx] || createResults[x.idx].state === "error");
  const pendingNew = pendingAll.filter((x) => !x.skip);
  const skippedCount = pendingAll.length - pendingNew.length;
  const readyNew = pendingNew.filter((x) => newItemProblems(x).length === 0);
  const conflicts = Object.values(createResults).filter((r) => r.state === "conflict");
  const pendingDecisions = conflicts.filter((r) => !decisions[r.idx]).length;

  const createdCards = (results: Record<number, CreateResult>, decs: Record<number, Decision>) => {
    const out: { key: string; price: number }[] = [];
    newItems.forEach((x) => {
      const r = results[x.idx];
      const d = decs[x.idx];
      const made = r?.state === "created" ? r : d?.kind === "create" && d.result.state === "created" ? d.result : null;
      if (made?.key) out.push({ key: made.key, price: toNumber(x.price) });
    });
    return out;
  };

  const unpricedList = (results: Record<number, CreateResult>, decs: Record<number, Decision>, done: string[]) =>
    createdCards(results, decs).filter((c) => c.price > 0 && !done.includes(c.key));

  const unpriced = unpricedList(createResults, decisions, pricedKeys).length;
  const createdCount = createdCards(createResults, decisions).length;
  const noPriceCount = createdCards(createResults, decisions).filter((c) => !(c.price > 0)).length;
  const noteCount = newItems.filter((x) => {
    const r = createResults[x.idx];
    const d = decisions[x.idx];
    const m = r?.state === "created" ? r : d?.kind === "create" && d.result.state === "created" ? d.result : null;
    return m ? m.country === "error" || m.barcode === "taken" || m.barcode === "error" : r?.state === "error";
  }).length;
  const newSummary = createdCount
    ? `Создано ${createdCount} из ${newItems.length}${noteCount ? `, замечания у ${noteCount}` : ""}${
        noPriceCount ? `, без цены: ${noPriceCount}` : ""
      }`
    : `Новых ${newItems.length}: готовы ${readyNew.length}${
        pendingNew.length - readyNew.length ? `, не хватает реквизитов ${pendingNew.length - readyNew.length}` : ""
      }${skippedCount ? `, не загружать ${skippedCount}` : ""}`;

  const priceNow = async (results = createResults, decs = decisions, done = pricedKeys) => {
    const rows = unpricedList(results, decs, done);
    if (!rows.length) return;
    setPricing(true);
    const doc = await setBasePrices(base, rows, `Создано сайтом по счёту ${invoice?.file_name || ""}`.trim());
    setPriceDocs((p) => [...p, doc]);
    if (doc.ok) {
      setPricedKeys((p) => [...p, ...rows.map((r) => r.key)]);
      setPriceDocByKey((p) => ({ ...p, ...Object.fromEntries(rows.map((r) => [r.key, doc.number || ""])) }));
    }
    setPricing(false);
  };

  const maybeAutoPrice = (results: Record<number, CreateResult>, decs: Record<number, Decision>) => {
    const left = Object.values(results).filter((r) => r.state === "conflict" && !decs[r.idx]).length;
    if (left === 0) priceNow(results, decs, pricedKeys);
  };

  const createIn1C = async () => {
    const list = readyNew;
    if (!list.length) return;
    setCreating(true);
    const acc: Record<number, CreateResult> = { ...createResults };
    const CHUNK = 5;
    setCreateProgress({ done: 0, total: list.length, stage: "Сверяю и создаю карточки" });
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = await createPortion(base, list.slice(i, i + CHUNK));
        part.forEach((r) => (acc[r.idx] = r));
        setCreateResults({ ...acc });
        setCreateProgress({ done: Math.min(i + CHUNK, list.length), total: list.length, stage: "Сверяю и создаю карточки" });
      }
    } catch (e) {
      toast({ title: "Создание остановлено", description: (e as Error).message, variant: "destructive" });
    }
    setCreating(false);
    const made = list.filter((x) => acc[x.idx]?.state === "created").length;
    const conf = list.filter((x) => acc[x.idx]?.state === "conflict").length;
    toast({ title: `Создано в 1С: ${made}`, description: conf ? `Нужно решение: ${conf}` : undefined });
    maybeAutoPrice(acc, decisions);
  };

  const decide = (idx: number, d: Decision) => {
    const next = { ...decisions, [idx]: d };
    setDecisions(next);
    maybeAutoPrice(createResults, next);
  };

  const decideCreate = async (idx: number) => {
    const item = newItems.find((x) => x.idx === idx);
    if (!item) return;
    setDecidingIdx(idx);
    try {
      const [r] = await createPortion(base, [item], true);
      decide(idx, { kind: "create", result: r });
    } catch (e) {
      decide(idx, { kind: "create", result: { idx, article: item.article, state: "error", error: (e as Error).message } });
    } finally {
      setDecidingIdx(null);
    }
  };

  const decideAttach = async (idx: number, card: ConflictCard) => {
    const item = newItems.find((x) => x.idx === idx);
    if (!item?.barcode) return;
    setDecidingIdx(idx);
    try {
      const r = await attachBarcode(base, card.key, item.barcode);
      decide(idx, { kind: "attach", card, ...r });
    } catch (e) {
      decide(idx, { kind: "attach", card, barcode: "error", barcode_error: (e as Error).message });
    } finally {
      setDecidingIdx(null);
    }
  };

  const undoDecision = (idx: number) =>
    setDecisions((prev) => {
      const n = { ...prev };
      delete n[idx];
      return n;
    });

  useEffect(() => {
    if (!unpriced) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unpriced]);

  const reset = () => {
    if (unpriced && !window.confirm(`У ${unpriced} созданных карточек нет базовой цены. Всё равно загрузить другой счёт?`)) return;
    setCreateResults({});
    setPriceDocs([]);
    setPricedKeys([]);
    setPriceDocByKey({});
    setDecisions({});
    setInvoice(null);
    setCatCol(null);
    setExcluded(new Set());
    setMatches([]);
    setResumeFrom(null);
    setDone(0);
    setWriteResults(null);
    setNewItems([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const hasResults = matches.some(Boolean);

  const dropResults = () => {
    setMatches([]);
    setResumeFrom(null);
    setDone(0);
    setFilter("all");
    setWriteResults(null);
    setNewItems([]);
    setCreateResults({});
    setDecisions({});
  };

  const changeCategories = (apply: () => void) => {
    if (hasResults || resumeFrom !== null) {
      if (Object.keys(createResults).length && !window.confirm("Уже есть созданные карточки. Сбросить результаты и проверить заново?")) return;
      if (!Object.keys(createResults).length && !window.confirm("Результаты проверки устареют. Сбросить их и проверить заново?")) return;
      dropResults();
    }
    apply();
  };
  const checked = hasResults && !checking;
  const busy = checking || writing || creating || pricing;

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
                  Позиций: {allItems.length} · с артикулом {filled.article} · со штрихкодом {items.filter((x) => x.barcode).length}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
                Другой счёт
              </Button>
            </div>
          )}
        </section>

        {invoice && (
          <NomenCategories
            columns={invoice.columns || []}
            items={allItems}
            column={catCol}
            excluded={excluded}
            disabled={busy}
            onColumn={(c) =>
              changeCategories(() => {
                setCatCol(c);
                setExcluded(suggestExcluded(allItems, c));
              })
            }
            onToggle={(cat) =>
              changeCategories(() =>
                setExcluded((prev) => {
                  const n = new Set(prev);
                  if (n.has(cat)) n.delete(cat);
                  else n.add(cat);
                  return n;
                }),
              )
            }
          />
        )}

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
            {items.length < allItems.length && (
              <div className="text-sm text-muted-foreground">
                К проверке {items.length} из {allItems.length}, отсеяно {allItems.length - items.length}
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {checking ? (
                <Button variant="outline" onClick={() => (stopRef.current = true)}>
                  <Icon name="Square" size={14} />
                  Остановить
                </Button>
              ) : (
                <>
                {resumeFrom !== null && (
                  <Button onClick={() => runFrom(resumeFrom, usedOpts ?? opts)} disabled={writing}>
                    <Icon name="Play" size={16} />
                    Продолжить с {resumeFrom + 1}
                  </Button>
                )}
                <Button variant={resumeFrom !== null ? "outline" : "default"} onClick={runCheck} disabled={writing || !items.length}>
                  <Icon name="Search" size={16} />
                  {hasResults ? "Проверить заново" : "Проверить в 1С"}
                </Button>
                </>
              )}
              {(checking || done > 0) && (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  {checking && <Icon name="Loader2" size={14} className="animate-spin" />}
                  Проверено {done} из {items.length}
                  {retryNote && <span className="text-amber-400">· {retryNote}</span>}
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
            items={items}
            matches={matches}
          />
        )}

        {checked && newItems.length === 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
            {counts.missing === 0
              ? "Новых позиций нет — все товары счёта уже есть в 1С."
              : "Проверка была остановлена. Запустите её до конца, чтобы заполнить новые позиции."}
          </div>
        )}

        {checked && pendingNew.length > 0 && (
          <NomenTnvedSteps
            base={base}
            items={pendingNew}
            fileCodes={fileCodes}
            found={tnvedFound}
            missing={missingTnvedList}
            failed={tnvedFailed}
            similarTotal={similarKinds.length}
            similarDone={similarKinds.filter((k) => tnved[k]).length}
            similarItems={similarTargets.length}
            kindsFailed={kindsFailed}
            step={step}
            setStep={setStep}
            onCheck={checkFileCodes}
            onCreated={onTnvedCreated}
            onApply={applyFileCodes}
            onSimilar={runSimilar}
          />
        )}

        {checked && pendingAll.length > 0 && (
          <NomenNewItems
            items={pendingAll}
            groups={groups}
            tnved={tnved}
            countries={countries}
            loading={refsLoading}
            onChange={patchNew}
            onAll={patchAll}
            onReload={loadRefs}
            tnvedMissing={tnvedMissing}
            base={base}
            onGroupAdded={(g) =>
              setGroups((prev) =>
                [...prev.filter((x) => x.key !== g.key), g].sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase())),
              )
            }
          />
        )}

        {checked && newItems.length > 0 && (
          <NomenCreatePanel
            items={newItems}
            readyCount={readyNew.length}
            results={createResults}
            priceDocs={priceDocs}
            unpriced={unpriced}
            pendingDecisions={pendingDecisions}
            running={creating}
            pricing={pricing}
            progress={createProgress}
            onCreate={createIn1C}
            onPriceNow={() => priceNow()}
          />
        )}

        {conflicts.length > 0 && (
          <NomenDecisions
            conflicts={conflicts}
            items={newItems}
            decisions={decisions}
            busyIdx={decidingIdx}
            locked={pendingDecisions === 0 && unpriced === 0}
            onCreate={decideCreate}
            onAttach={decideAttach}
            onSkip={(idx) => decide(idx, { kind: "skip" })}
            onUndo={undoDecision}
          />
        )}

        {checked && rowsForExcel(newItems, createResults, decisions).length > 0 && (
          <NomenExcelPanel
            rows={rowsForExcel(newItems, createResults, decisions)}
            groups={groups}
            countries={countries}
            invoiceName={invoice?.file_name || ""}
            pendingDecisions={pendingDecisions}
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
            {newItems.length > 0 && (
              <div className="text-[11px] text-muted-foreground rounded-lg border border-white/[0.08] px-3 py-2 space-y-0.5">
                <div>{newSummary}</div>
                <div>Для всех новых: {COMMON_REQUISITES}</div>
              </div>
            )}
            <NomenMatchTable
              items={items}
              matches={matches}
              filter={filter}
              showHits={usedOpts?.mode === "all"}
              renderExtra={(i) => {
                const x = newItems.find((n) => n.idx === i);
                if (!x) return null;
                const r = createResults[i];
                const d = decisions[i];
                const made =
                  r?.state === "created" ? r : d?.kind === "create" && d.result.state === "created" ? d.result : null;
                if (r?.state === "conflict" && !made) return null;
                return (
                  <NomenRequisites
                    item={x}
                    originalName={items[i]?.name || ""}
                    kind={tnved[x.kind]}
                    groups={groups}
                    countries={countries}
                    made={made}
                    failed={r?.state === "error" ? r : d?.kind === "create" && d.result.state === "error" ? d.result : null}
                    exists={r?.state === "exists" ? r : null}
                    priceDoc={made?.key && pricedKeys.includes(made.key) ? priceDocByKey[made.key] || "создан" : null}
                  />
                );
              }}
            />
          </section>
        )}

        {!(checked && rowsForExcel(newItems, createResults, decisions).length > 0) && (
        <div className="space-y-2 pt-2">
          {NEXT_STEPS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-xl border border-white/[0.08] bg-card p-3 flex items-center gap-3 opacity-60"
            >
              <Icon name={s.icon} size={18} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {i + 5}. {s.title}
                </div>
                <div className="text-xs text-muted-foreground">{s.hint}</div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">после создания</span>
            </div>
          ))}
        </div>
        )}
      </main>
    </div>
  );
};

export default OdataNomenclature;