import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import PickList from "@/components/search-dicts/PickList";
import NewFolderButton from "@/components/invoices/NewFolderButton";
import UploadBanner, { UploadProgress } from "@/components/catalog/UploadBanner";
import ReportItemsSheet, { ReportGroup, ReportItem } from "@/components/catalog/ReportItemsSheet";
import BarcodeStep from "@/components/catalog/BarcodeStep";
import UploadSteps, { UploadStep } from "@/components/catalog/UploadSteps";
import BrandGroupMap, { BrandRow } from "@/components/catalog/BrandGroupMap";
import LongNames, { NAME_MAX } from "@/components/catalog/LongNames";
import GroupConflicts, { ConflictAction, GroupConflict } from "@/components/catalog/GroupConflicts";

const CATALOG_URL = "https://functions.poehali.dev/85960a37-dc7f-4ace-b024-444033b366d7";

const FIELDS: { key: string; title: string }[] = [
  { key: "article", title: "Артикул" },
  { key: "name", title: "Наименование" },
  { key: "barcode", title: "Штрихкод" },
  { key: "category", title: "Категория поставщика" },
  { key: "brand", title: "Бренд" },
  { key: "tnved", title: "Код ТНВЭД" },
  { key: "weight_gross", title: "Вес брутто" },
  { key: "weight_net", title: "Вес нетто" },
  { key: "price_retail", title: "Розничная цена" },
  { key: "price_wholesale", title: "Оптовая цена" },
  { key: "price", title: "Цена" },
];

const PRICE_SOURCES = ["price_retail", "price_wholesale", "price"];

const OUR_PRICES: { key: string; title: string }[] = [
  { key: "price_base", title: "Базовая цена" },
  { key: "price_retail", title: "Розничная цена" },
  { key: "price_wholesale", title: "Оптовая цена" },
  { key: "price_purchase", title: "Закупочная цена" },
];

interface Supplier {
  id: number;
  name: string;
  layouts: number;
}

interface Column {
  index: number;
  title: string;
  field: string | null;
}

interface CategoryStat {
  category: string;
  count: number;
  suggest_exclude: boolean;
}

interface AlphabetStats {
  lat: number;
  cyr_unique: number;
  cyr_twins: number;
  mixed: number;
  none: number;
  samples: Record<string, string[]>;
}

interface ParseResult {
  draft_id: number;
  header_signature: string;
  mapping: Record<string, number>;
  columns: Column[];
  categories: CategoryStat[];
  alphabet: AlphabetStats;
  layout_reused?: boolean;
  price_mapping?: Record<string, string>;
  excluded_categories?: string[];
  article_case?: string;
  stats: {
    total: number;
    rows_read?: number;
    merged_rows?: number;
    barcodes_total?: number;
    multi_barcode?: number;
    guessed_article: number;
    no_article: number;
    with_barcode: number;
    with_tnved: number;
    with_weight_gross: number;
    with_weight_net: number;
  };
}

interface FillStat {
  field: string;
  title: string;
  empty: number;
  differ: number;
}

interface Report {
  total: number;
  new_count: number;
  exist_count: number;
  new_items?: ReportItem[];
  exist_items?: ReportItem[];
  excluded_items?: ReportItem[];
  excluded_count: number;
  excluded_existing?: number;
  conflicts?: GroupConflict[];
  conflict_count?: number;
  undecided?: number;
  fill: FillStat[];
}

interface PendingDraft {
  id: number;
  file_name: string;
  rows_count: number;
  stage: string;
  created_at: string;
  supplier_name: string | null;
}

const CatalogUpload = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";
  const fileRef = useRef<HTMLInputElement>(null);
  const authHeaders = {
    "Content-Type": "application/json",
    "X-Auth-Token": token,
  };

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileData, setFileData] = useState<{ b64: string; name: string } | null>(null);

  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [articleCase, setArticleCase] = useState("as_is");
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});
  const [vatRate, setVatRate] = useState("");
  const [productGroup, setProductGroup] = useState("");
  const [folders, setFolders] = useState<{ name: string; products: number }[]>([]);
  const [longNames, setLongNames] = useState<Record<number, string>>({});
  const [groupMode, setGroupMode] = useState<"single" | "brand">("single");
  const [brandRows, setBrandRows] = useState<BrandRow[]>([]);
  const [brandMap, setBrandMap] = useState<Record<string, string>>({});
  const [brandLoading, setBrandLoading] = useState(false);
  const [newFolders, setNewFolders] = useState<string[]>([]);
  const [fillMode, setFillMode] = useState("empty_only");
  const [fillFields, setFillFields] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<UploadStep>(1);
  const [bcDraft, setBcDraft] = useState<number | null>(null);
  const [productsDone, setProductsDone] = useState<{ draftId: number; created: number; updated: number } | null>(null);
  const [pending, setPending] = useState<PendingDraft[]>([]);
  const [bcBusy, setBcBusy] = useState(false);

  const [report, setReport] = useState<Report | null>(null);
  const [reportKey, setReportKey] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [openGroup, setOpenGroup] = useState<ReportGroup | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  useEffect(() => {
    if (!saving && !bcBusy) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saving, bcBusy]);

  const loadPending = useCallback(async () => {
    try {
      const r = await fetch(`${CATALOG_URL}?action=drafts`, { headers: authHeaders });
      const d = await r.json();
      if (r.ok) setPending((d.drafts || []).filter((x: PendingDraft) => x.stage === "products_done"));
    } catch {
      setPending([]);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      const r = await fetch(`${CATALOG_URL}?action=suppliers`, { headers: authHeaders });
      const d = await r.json();
      if (r.ok) setSuppliers(d.suppliers || []);
    } catch {
      toast({ title: "Не удалось загрузить поставщиков", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin/catalog");
      return;
    }
    loadSuppliers();
    loadPending();
    fetch(`${CATALOG_URL}?action=folders`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => setFolders(d.folders || []))
      .catch(() => setFolders([]));
  }, []);

  const hasBrandCol = !!result && result.mapping && result.mapping.brand !== undefined;
  const brandKey = result ? `${result.draft_id}|${[...excluded].sort().join(",")}|${articleCase}` : "";

  useEffect(() => {
    if (!result || groupMode !== "brand" || !hasBrandCol) return;
    let stop = false;
    setBrandLoading(true);
    fetch(CATALOG_URL, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "brand_groups",
        draft_id: result.draft_id,
        excluded_categories: Array.from(excluded),
        article_case: articleCase,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (stop) return;
        const rows: BrandRow[] = d.brands || [];
        setBrandRows(rows);
        setBrandMap((prev) => {
          const n: Record<string, string> = {};
          rows.forEach((r) => (n[r.brand] = prev[r.brand] !== undefined ? prev[r.brand] : r.group));
          return n;
        });
      })
      .catch(() => !stop && setBrandRows([]))
      .finally(() => !stop && setBrandLoading(false));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey, groupMode, hasBrandCol]);

  useEffect(() => {
    if (!hasBrandCol && groupMode === "brand") setGroupMode("single");
  }, [hasBrandCol, groupMode]);

  if (user.role !== "owner") return null;

  const longLeft = (report?.new_items || []).filter((x) => {
    const v = x.row !== undefined && longNames[x.row] !== undefined ? longNames[x.row] : x.name;
    return v.trim().length > NAME_MAX || !v.trim();
  }).length;

  const allFolders = [
    ...folders,
    ...newFolders
      .filter((n) => !folders.some((f) => f.name.toLowerCase() === n.toLowerCase()))
      .map((name) => ({ name, products: 0 })),
  ];
  const unmappedBrands = brandRows.filter(
    (r) => !allFolders.some((f) => f.name.trim().toLowerCase() === (brandMap[r.brand] || "").trim().toLowerCase() && brandMap[r.brand]),
  );

  const createSupplier = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const r = await fetch(CATALOG_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ action: "create_supplier", name }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Ошибка", variant: "destructive" });
        return;
      }
      setSupplier({ ...d.supplier, layouts: 0 });
      setNewName("");
      loadSuppliers();
    } finally {
      setCreating(false);
    }
  };

  const applyResult = (d: ParseResult) => {
    setResult(d);
    setReport(null);
    const ex = new Set<string>(
      d.excluded_categories && d.excluded_categories.length
        ? d.excluded_categories
        : (d.categories || []).filter((c) => c.suggest_exclude).map((c) => c.category),
    );
    setExcluded(ex);
    if (d.article_case) setArticleCase(d.article_case);
    if (d.price_mapping && Object.keys(d.price_mapping).length) {
      setPriceMap(d.price_mapping);
    } else {
      const cols = Object.keys(d.mapping || {});
      const guess: Record<string, string> = {};
      if (cols.includes("price_retail")) guess.price_base = "price_retail";
      else if (cols.includes("price")) guess.price_base = "price";
      setPriceMap(guess);
    }
    setFillFields(new Set());
  };

  const parseFile = async (b64: string, name: string, mapping?: Record<string, number>) => {
    setParsing(true);
    try {
      const r = await fetch(CATALOG_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          action: "parse",
          file: b64,
          file_name: name,
          supplier_id: supplier?.id || null,
          mapping: mapping || null,
          draft_id: result?.draft_id || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Не удалось разобрать файл", variant: "destructive" });
        return;
      }
      applyResult(d);
      if (d.layout_reused) {
        toast({ title: "Разметка взята из памяти" });
      }
    } catch {
      toast({ title: "Ошибка при разборе файла", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const onFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const b64 = btoa(bin);
    setFileData({ b64, name: f.name });
    parseFile(b64, f.name);
  };

  const setFieldColumn = (field: string, colIndex: string) => {
    if (!result || !fileData) return;
    const mp = { ...result.mapping };
    delete mp[field];
    if (colIndex !== "") mp[field] = Number(colIndex);
    parseFile(fileData.b64, fileData.name, mp);
  };

  const toggleCategory = (name: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setReport(null);
  };

  const groupKey = JSON.stringify(
    groupMode === "brand"
      ? { m: "brand", b: Object.keys(brandMap).sort().map((k) => [k, brandMap[k]]) }
      : { m: "single", g: productGroup.trim() },
  );
  const stale = !!report && reportKey !== groupKey;

  const runCheck = async (keep = false) => {
    if (!result) return;
    if (keep) setDeciding(true);
    else setChecking(true);
    try {
      const r = await fetch(CATALOG_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          action: "preview",
          draft_id: result.draft_id,
          excluded_categories: Array.from(excluded),
          article_case: articleCase,
          group_mode: groupMode,
          product_group: groupMode === "single" ? productGroup || null : null,
          brand_groups: groupMode === "brand" ? brandMap : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Ошибка сверки", variant: "destructive" });
        return;
      }
      setReport(d.report);
      setReportKey(groupKey);
      if (!keep) {
        setLongNames({});
        setFillFields(new Set((d.report.fill || []).map((f: FillStat) => f.field)));
      }
    } finally {
      setChecking(false);
      setDeciding(false);
    }
  };

  const decide = async (rows: { row: number; action: ConflictAction; product_id: number }[]) => {
    if (!result || !rows.length) return;
    setDeciding(true);
    try {
      const r = await fetch(CATALOG_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          action: "group_decide",
          draft_id: result.draft_id,
          decisions: Object.fromEntries(rows.map((x) => [String(x.row), { action: x.action, product_id: x.product_id }])),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Не сохранил решение");
      await runCheck(true);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setDeciding(false);
    }
  };

  const runCommit = async () => {
    if (!result) return;
    setSaving(true);
    const fixes = Object.fromEntries(Object.entries(longNames).map(([k, v]) => [k, v.trim().replace(/\s+/g, " ")]));
    if (Object.keys(fixes).length && !(progress && progress.status === "error" && progress.done > 0)) {
      try {
        const r = await fetch(CATALOG_URL, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ action: "rename_items", draft_id: result.draft_id, names: fixes }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Не сохранил наименования");
      } catch (e) {
        toast({ title: (e as Error).message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }
    const prev = progress && progress.status === "error" && progress.draftId === result.draft_id ? progress : null;
    let st: UploadProgress = prev
      ? { ...prev, status: "running", error: "" }
      : { draftId: result.draft_id, status: "running", done: 0, total: report?.total || 0,
          created: 0, updated: 0, error: "" };
    setProgress(st);
    try {
      while (true) {
        const r = await fetch(CATALOG_URL, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            action: "commit",
            draft_id: result.draft_id,
            offset: st.done,
            limit: 100,
            excluded_categories: Array.from(excluded),
            article_case: articleCase,
            price_mapping: priceMap,
            vat_rate: vatRate || null,
            product_group: groupMode === "single" ? productGroup || null : null,
            group_mode: groupMode,
            brand_groups: groupMode === "brand" ? brandMap : null,
            fill_mode: fillMode,
            fill_fields: Array.from(fillFields),
            header_signature: result.header_signature,
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Сервер не ответил, попробуйте продолжить");
        const res = d.result;
        st = {
          ...st,
          done: res.done,
          total: res.total,
          created: st.created + res.created,
          updated: st.updated + res.updated,
        };
        if (res.finished) {
          st = { ...st, status: "done" };
          setProgress(st);
          setProductsDone({ draftId: result.draft_id, created: st.created, updated: st.updated });
          break;
        }
        setProgress(st);
      }
    } catch (err) {
      setProgress({ ...st, status: "error", error: (err as Error).message || "Ошибка записи" });
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setResult(null);
    setReport(null);
    setFileData(null);
    setProductsDone(null);
    setBcDraft(null);
    setProgress(null);
    setStep(1);
    loadPending();
  };

  const goBarcodes = (draftId: number) => {
    setBcDraft(draftId);
    setProgress(null);
    setStep(3);
    window.scrollTo({ top: 0 });
  };

  const dropPending = async (id: number) => {
    await fetch(CATALOG_URL, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ action: "drop_draft", draft_id: id }),
    }).catch(() => null);
    loadPending();
  };

  const alpha = result?.alphabet;
  const excludedCount = result
    ? (result.categories || [])
        .filter((c) => excluded.has(c.category))
        .reduce((s, c) => s + c.count, 0)
    : 0;

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      {progress && (
        <UploadBanner
          p={progress}
          onRetry={runCommit}
          canRetry={!!result && result.draft_id === progress.draftId}
          onClose={() => setProgress(null)}
        />
      )}
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => navigate("/admin/catalog")}
          >
            <Icon name="ArrowLeft" size={20} />
          </Button>
          <h1 className="text-xl font-semibold">Загрузка каталога поставщика</h1>
        </div>

        <UploadSteps step={step} />

        {step === 3 && bcDraft && (
          <BarcodeStep
            url={CATALOG_URL}
            headers={authHeaders}
            draftId={bcDraft}
            onBusy={setBcBusy}
            onFinish={resetAll}
          />
        )}

        {step === 1 && pending.length > 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
            <div className="text-sm font-medium">Штрихкоды не записаны</div>
            <div className="text-xs text-muted-foreground">
              Товары из этих файлов загружены, осталось сверить и записать штрихкоды
            </div>
            {pending.map((pd) => (
              <div key={pd.id} className="flex items-center gap-2 rounded-xl bg-secondary p-2">
                <div className="flex-1 min-w-0 text-sm">
                  <div className="truncate">{pd.file_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {pd.supplier_name ? `${pd.supplier_name} · ` : ""}
                    {pd.rows_count} строк
                  </div>
                </div>
                <Button size="sm" className="rounded-xl" onClick={() => goBarcodes(pd.id)}>
                  Штрихкоды
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-xl h-8 w-8"
                  onClick={() => dropPending(pd.id)}
                >
                  <Icon name="X" size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {step === 1 && (
          <>

        <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-muted-foreground">Поставщик</div>
          <div className="flex flex-wrap gap-2">
            {suppliers.map((s) => (
              <button
                key={s.id}
                onClick={() => setSupplier(s)}
                className={`px-3 py-2 rounded-xl text-sm border ${
                  supplier?.id === s.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/[0.08] bg-secondary"
                }`}
              >
                {s.name}
                {s.layouts > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">разметка есть</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Новый поставщик"
              className="h-10 rounded-xl bg-secondary border-white/[0.08]"
            />
            <Button
              onClick={createSupplier}
              disabled={creating || !newName.trim()}
              className="rounded-xl"
            >
              Добавить
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-muted-foreground">Файл каталога</div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="rounded-xl w-full"
          >
            <Icon name="Upload" size={18} className="mr-2" />
            {parsing ? "Читаю файл..." : fileData ? fileData.name : "Выбрать файл Excel"}
          </Button>
          {result && (
            <div className="text-sm text-muted-foreground">
              Прочитано {result.stats.rows_read ?? result.stats.total} строк, товаров {result.stats.total}
              {(result.stats.merged_rows ?? 0) > 0 &&
                ` (склеено строк одного товара: ${result.stats.merged_rows})`}
              . Штрихкодов {result.stats.barcodes_total ?? result.stats.with_barcode}
              {(result.stats.multi_barcode ?? 0) > 0 &&
                `, у ${result.stats.multi_barcode} товаров их несколько`}
              , ТНВЭД {result.stats.with_tnved}, весов {result.stats.with_weight_gross}
            </div>
          )}
        </div>

        {result && (
          <>
            <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Реквизиты и колонки файла</div>
              <div className="text-xs text-muted-foreground">
                Одну колонку можно выбрать для нескольких реквизитов
              </div>
              <div className="space-y-2">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <div className="w-24 sm:w-40 shrink-0 text-xs sm:text-sm leading-tight line-clamp-2 break-words">
                      {f.title}
                    </div>
                    <select
                      value={result.mapping[f.key] ?? ""}
                      onChange={(e) => setFieldColumn(f.key, e.target.value)}
                      className="h-9 flex-1 min-w-0 rounded-xl bg-secondary border border-white/[0.08] px-2 text-sm"
                    >
                      <option value="">не используется</option>
                      {result.columns.map((c) => (
                        <option key={c.index} value={c.index}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Цены</div>
              <div className="text-xs text-muted-foreground">
                Куда класть цены из файла
              </div>
              {OUR_PRICES.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <div className="flex-1 text-sm">{p.title}</div>
                  <select
                    value={priceMap[p.key] || ""}
                    onChange={(e) =>
                      setPriceMap((prev) => ({ ...prev, [p.key]: e.target.value }))
                    }
                    className="h-9 rounded-xl bg-secondary border border-white/[0.08] px-2 text-sm w-48"
                  >
                    <option value="">пусто</option>
                    {PRICE_SOURCES.filter((s) =>
                      result.mapping[s] !== undefined,
                    ).map((s) => (
                      <option key={s} value={s}>
                        {FIELDS.find((f) => f.key === s)?.title}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <Button onClick={() => setStep(2)} className="rounded-xl w-full">
              Дальше: товары
              <Icon name="ArrowRight" size={18} className="ml-2" />
            </Button>
          </>
        )}
          </>
        )}

        {step === 2 && result && (
          <>
            <div className="rounded-2xl border border-white/[0.08] bg-card p-4 flex items-center gap-2">
              <div className="flex-1 min-w-0 text-sm">
                <div className="truncate">{supplier?.name ? `${supplier.name} · ` : ""}{fileData?.name}</div>
                <div className="text-xs text-muted-foreground">товаров в файле {result.stats.total}</div>
              </div>
              {!productsDone && (
                <Button variant="ghost" size="sm" className="rounded-xl" disabled={saving} onClick={() => setStep(1)}>
                  <Icon name="ArrowLeft" size={16} className="mr-1" />
                  Файл
                </Button>
              )}
            </div>

            {alpha && (
              <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
                <div className="text-sm font-medium text-muted-foreground">Артикулы</div>
                <div className="space-y-1 text-sm">
                  {alpha.lat > 0 && <div>Латиницей: {alpha.lat}</div>}
                  {alpha.cyr_twins > 0 && (
                    <div className="text-amber-500">
                      Кириллица (буквы-двойники): {alpha.cyr_twins}
                      {alpha.samples.cyr_twins?.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          — например {alpha.samples.cyr_twins.join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                  {alpha.cyr_unique > 0 && (
                    <div className="text-amber-500">
                      Кириллица однозначная: {alpha.cyr_unique}
                      {alpha.samples.cyr_unique?.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          — например {alpha.samples.cyr_unique.join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                  {alpha.mixed > 0 && (
                    <div className="text-red-400">
                      Смешанные (и кириллица, и латиница): {alpha.mixed}
                      {alpha.samples.mixed?.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          — например {alpha.samples.mixed.join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { v: "as_is", t: "Как есть" },
                    { v: "cyrillic", t: "Кириллицей" },
                    { v: "latin", t: "Латиницей" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => {
                        setArticleCase(o.v);
                        setReport(null);
                      }}
                      className={`px-3 py-2 rounded-xl text-sm border ${
                        articleCase === o.v
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-white/[0.08] bg-secondary"
                      }`}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">
                  Категории поставщика
                </div>
                <div className="text-xs text-muted-foreground">
                  отсеется {excludedCount}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Отметьте категории, которые не нужно загружать
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {result.categories.map((c) => (
                  <label
                    key={c.category}
                    className="flex items-center gap-2 py-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={excluded.has(c.category)}
                      onChange={() => toggleCategory(c.category)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="flex-1 text-sm truncate">{c.category}</span>
                    <span className="text-xs text-muted-foreground">{c.count}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                Общие реквизиты
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Ставка НДС</label>
                  <select
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    className="w-full h-10 rounded-xl bg-secondary border border-white/[0.08] px-3 text-sm"
                  >
                    <option value="">Не указывать</option>
                    <option value="22">22</option>
                    <option value="Без НДС">Без НДС</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Группа для новых товаров</label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["single", "Одна группа для всех"],
                      ["brand", "Сопоставление по брендам"],
                    ] as const
                  ).map(([v, t]) => (
                    <button
                      key={v}
                      type="button"
                      disabled={v === "brand" && !hasBrandCol}
                      onClick={() => setGroupMode(v)}
                      className={`rounded-xl border px-3 py-2 text-sm text-left disabled:opacity-40 ${
                        groupMode === v ? "border-primary bg-primary/10" : "border-white/[0.08] hover:bg-white/[0.04]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {!hasBrandCol && (
                  <p className="text-[11px] text-muted-foreground">В файле нет колонки «Бренд» — доступна только одна группа для всех</p>
                )}
                {groupMode === "single" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-full sm:w-72">
                      <PickList
                        value={productGroup}
                        onChange={setProductGroup}
                        placeholder="Не указывать"
                        extra={[{ value: "", label: "Не указывать" }]}
                        options={[
                          ...folders.map((f) => ({ value: f.name, label: f.name, count: f.products })),
                          ...(productGroup && !folders.some((f) => f.name === productGroup)
                            ? [{ value: productGroup, label: `${productGroup} (новая)` }]
                            : []),
                        ]}
                      />
                    </div>
                    <NewFolderButton existing={folders.map((f) => f.name)} onApply={setProductGroup} />
                  </div>
                ) : brandLoading && !brandRows.length ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Icon name="Loader2" size={13} className="animate-spin" />
                    Собираю бренды из файла…
                  </div>
                ) : (
                  <>
                    <BrandGroupMap
                      rows={brandRows}
                      map={brandMap}
                      folders={allFolders}
                      onChange={(b, g) => setBrandMap((p) => ({ ...p, [b]: g }))}
                      onNewFolder={(n) => setNewFolders((p) => (p.includes(n) ? p : [...p, n]))}
                    />
                    {unmappedBrands.length > 0 && (
                      <p className="text-[11px] text-amber-400">
                        Без группы: {unmappedBrands.length} — их товары попадут в группу «Общая»
                      </p>
                    )}
                  </>
                )}
                <p className="text-[11px] text-muted-foreground">Только для новых товаров</p>
              </div>
            </div>

            {stale && !productsDone && (
              <div className="text-xs text-amber-400 text-center">Группы изменились после сверки — отчёт устарел</div>
            )}
            <Button
              onClick={() => runCheck()}
              disabled={checking || !!productsDone}
              className="rounded-xl w-full"
              variant="secondary"
            >
              {checking ? "Сверяю..." : stale ? "Пересверить" : "Сверить с каталогом"}
            </Button>
          </>
        )}

        {step === 2 && report && (
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
            <div className="text-sm font-medium text-muted-foreground">Итоги сверки</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["new", report.new_count, "новых", "text-primary", report.new_items],
                  ["exist", report.exist_count, "уже есть", "", report.exist_items],
                  ["excluded", report.excluded_count, "отсеяно", "", report.excluded_items],
                ] as [ReportGroup, number, string, string, ReportItem[] | undefined][]
              ).map(([g, n, label, cls, list]) => {
                const can = n > 0 && !!list?.length;
                return (
                  <button
                    key={g}
                    type="button"
                    disabled={!can}
                    onClick={() => setOpenGroup(g)}
                    className={`rounded-xl bg-secondary p-3 transition-colors ${
                      can ? "hover:bg-secondary/70 active:scale-[0.98] cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <div className={`text-lg font-semibold ${cls}`}>{n}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      {label}
                      {can && <Icon name="ChevronRight" size={12} />}
                    </div>
                  </button>
                );
              })}
            </div>
            <GroupConflicts items={report.conflicts || []} busy={deciding || saving || !!productsDone} onDecide={decide} />
            <ReportItemsSheet
              group={openGroup}
              items={
                openGroup === "new"
                  ? report.new_items || []
                  : openGroup === "exist"
                    ? report.exist_items || []
                    : openGroup === "excluded"
                      ? report.excluded_items || []
                      : []
              }
              onClose={() => setOpenGroup(null)}
            />

            <LongNames
              items={report.new_items || []}
              names={longNames}
              onChange={(row, name) => setLongNames((p) => ({ ...p, [row]: name }))}
            />

            {(report.excluded_existing ?? 0) > 0 && (
              <div className="text-xs text-muted-foreground">
                Из отсеянных уже есть в каталоге: {report.excluded_existing}
              </div>
            )}

            {report.fill.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <div className="text-sm font-medium">Дополнить существующие товары</div>
                {report.fill.map((f) => (
                  <label key={f.field} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fillFields.has(f.field)}
                      onChange={() =>
                        setFillFields((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.field)) next.delete(f.field);
                          else next.add(f.field);
                          return next;
                        })
                      }
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm flex-1">
                      {f.title}: пусто у {f.empty}
                      {f.differ > 0 && `, отличается у ${f.differ}`}
                    </span>
                  </label>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { v: "empty_only", t: "Только пустые" },
                    { v: "overwrite", t: "Переписать все" },
                    { v: "skip", t: "Не трогать" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setFillMode(o.v)}
                      className={`px-3 py-2 rounded-xl text-sm border ${
                        fillMode === o.v
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-white/[0.08] bg-secondary"
                      }`}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>
                {fillMode === "overwrite" && (
                  <div className="text-xs text-amber-500">
                    Данные каталога перепишут наши, включая цены
                  </div>
                )}
              </div>
            )}

            {productsDone ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2">
                <div className="text-sm flex items-center gap-2">
                  <Icon name="CircleCheck" size={16} className="text-emerald-400" />
                  Товары загружены: создано {productsDone.created}, обновлено {productsDone.updated}
                </div>
                <Button className="rounded-xl w-full" onClick={() => goBarcodes(productsDone.draftId)}>
                  Дальше: штрихкоды
                  <Icon name="ArrowRight" size={18} className="ml-2" />
                </Button>
              </div>
            ) : (
              <>
              {longLeft > 0 && (
                <div className="text-xs text-rose-400 text-center">
                  Сократите наименования: осталось {longLeft}
                </div>
              )}
              {(report.undecided ?? 0) > 0 && (
                <div className="text-xs text-rose-400 text-center">
                  Нужно решение: {report.undecided} — товары найдены в другой группе
                </div>
              )}
              {stale && (
                <div className="text-xs text-rose-400 text-center">Группы изменились — нажмите «Пересверить»</div>
              )}
              <Button
                onClick={runCommit}
                disabled={saving || longLeft > 0 || (report.undecided ?? 0) > 0 || stale || deciding}
                className="rounded-xl w-full"
              >
                {saving
                  ? `Загружаю… ${progress?.done ?? 0} из ${progress?.total ?? report.total}`
                  : progress?.status === "error"
                    ? "Продолжить загрузку"
                    : "Загрузить товары"}
              </Button>
              </>
            )}
            <div className="text-xs text-muted-foreground text-center">
              Штрихкоды записываются на следующем шаге
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CatalogUpload;