import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

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
  excluded_count: number;
  fill: FillStat[];
  barcodes: {
    total: number;
    dup_in_file: number;
    already_taken: number;
    to_add: number;
  };
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
  const [fillMode, setFillMode] = useState("empty_only");
  const [fillFields, setFillFields] = useState<Set<string>>(new Set());
  const [addBarcodes, setAddBarcodes] = useState(true);

  const [report, setReport] = useState<Report | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

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
  }, []);

  if (user.role !== "owner") return null;

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
      const cols = (d.columns || []).map((c) => c.field).filter(Boolean) as string[];
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

  const setColumnField = (colIndex: number, field: string) => {
    if (!result || !fileData) return;
    const mp = { ...result.mapping };
    Object.keys(mp).forEach((k) => {
      if (mp[k] === colIndex) delete mp[k];
    });
    if (field) mp[field] = colIndex;
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

  const runCheck = async () => {
    if (!result) return;
    setChecking(true);
    try {
      const r = await fetch(CATALOG_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          action: "preview",
          draft_id: result.draft_id,
          excluded_categories: Array.from(excluded),
          article_case: articleCase,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Ошибка сверки", variant: "destructive" });
        return;
      }
      setReport(d.report);
      setFillFields(new Set((d.report.fill || []).map((f: FillStat) => f.field)));
    } finally {
      setChecking(false);
    }
  };

  const runCommit = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const r = await fetch(CATALOG_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          action: "commit",
          draft_id: result.draft_id,
          excluded_categories: Array.from(excluded),
          article_case: articleCase,
          price_mapping: priceMap,
          vat_rate: vatRate || null,
          product_group: productGroup || null,
          fill_mode: fillMode,
          fill_fields: Array.from(fillFields),
          add_barcodes: addBarcodes,
          header_signature: result.header_signature,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Ошибка записи", variant: "destructive" });
        return;
      }
      const res = d.result;
      toast({
        title: "Каталог загружен",
        description: `Создано ${res.created}, обновлено ${res.updated}, штрихкодов ${res.barcodes_added}`,
      });
      setResult(null);
      setReport(null);
      setFileData(null);
    } finally {
      setSaving(false);
    }
  };

  const alpha = result?.alphabet;
  const excludedCount = result
    ? (result.categories || [])
        .filter((c) => excluded.has(c.category))
        .reduce((s, c) => s + c.count, 0)
    : 0;

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
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
              Прочитано {result.stats.total} строк. Штрихкодов {result.stats.with_barcode},
              ТНВЭД {result.stats.with_tnved}, весов {result.stats.with_weight_gross}
            </div>
          )}
        </div>

        {result && (
          <>
            <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Колонки файла</div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {result.columns.map((c) => (
                  <div key={c.index} className="flex items-center gap-2">
                    <div className="flex-1 text-sm truncate">{c.title}</div>
                    <select
                      value={c.field || ""}
                      onChange={(e) => setColumnField(c.index, e.target.value)}
                      className="h-9 rounded-xl bg-secondary border border-white/[0.08] px-2 text-sm w-48"
                    >
                      <option value="">не используется</option>
                      {FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.title}
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
                      result.columns.some((c) => c.field === s),
                    ).map((s) => (
                      <option key={s} value={s}>
                        {FIELDS.find((f) => f.key === s)?.title}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
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
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Группа</label>
                  <Input
                    value={productGroup}
                    onChange={(e) => setProductGroup(e.target.value)}
                    className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={addBarcodes}
                  onChange={(e) => setAddBarcodes(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Добавлять штрихкоды</span>
              </label>
            </div>

            <Button
              onClick={runCheck}
              disabled={checking}
              className="rounded-xl w-full"
              variant="secondary"
            >
              {checking ? "Сверяю..." : "Сверить с каталогом"}
            </Button>
          </>
        )}

        {report && (
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
            <div className="text-sm font-medium text-muted-foreground">Итоги сверки</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-secondary p-3">
                <div className="text-lg font-semibold text-primary">{report.new_count}</div>
                <div className="text-xs text-muted-foreground">новых</div>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <div className="text-lg font-semibold">{report.exist_count}</div>
                <div className="text-xs text-muted-foreground">уже есть</div>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <div className="text-lg font-semibold">{report.excluded_count}</div>
                <div className="text-xs text-muted-foreground">отсеяно</div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Штрихкодов в файле {report.barcodes.total}, уже заняты{" "}
              {report.barcodes.already_taken}, добавится {report.barcodes.to_add}
              {report.barcodes.dup_in_file > 0 &&
                `, повторов внутри файла ${report.barcodes.dup_in_file}`}
            </div>

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

            <Button onClick={runCommit} disabled={saving} className="rounded-xl w-full">
              {saving ? "Записываю..." : "Загрузить в каталог"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CatalogUpload;
