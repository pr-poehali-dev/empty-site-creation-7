import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import InvoiceMatch from "@/components/invoices/InvoiceMatch";

const INVOICE_URL = "https://functions.poehali.dev/da75537b-bd2c-4bb3-b3ee-5cd90f17c9a2";

const FIELDS: { key: string; title: string }[] = [
  { key: "num", title: "№" },
  { key: "article", title: "Артикул" },
  { key: "barcode", title: "Штрихкод" },
  { key: "name", title: "Наименование" },
  { key: "qty", title: "Количество" },
  { key: "unit", title: "Ед.изм." },
  { key: "price", title: "Цена" },
  { key: "total", title: "Сумма" },
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

interface Item {
  num: string;
  article: string;
  article_guessed: boolean;
  barcode: string;
  name: string;
  qty: number | null;
  unit: string;
  price: number | null;
  total: number | null;
  price_mismatch: boolean;
}

interface Draft {
  id: number;
  file_name: string;
  rows_count: number;
  total_sum: number;
  supplier_name: string | null;
  supplier_id: number | null;
  updated_at: string;
}

interface ParseResult {
  header_index: number;
  header_signature: string;
  mapping: Record<string, number>;
  columns: Column[];
  items: Item[];
  layout_used: boolean;
  file_name: string;
  stats: {
    total: number;
    guessed_article: number;
    no_article: number;
    price_mismatch: number;
    no_price: number;
  };
}

const InvoiceUpload = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const fileRef = useRef<HTMLInputElement>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileData, setFileData] = useState<{ b64: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);

  const loadSuppliers = useCallback(async () => {
    try {
      const r = await fetch(`${INVOICE_URL}?action=suppliers`);
      const d = await r.json();
      if (r.ok) setSuppliers(d.suppliers || []);
    } catch {
      toast({ title: "Не удалось загрузить поставщиков", variant: "destructive" });
    }
  }, [toast]);

  const loadDrafts = useCallback(async () => {
    try {
      const r = await fetch(`${INVOICE_URL}?action=drafts`);
      const d = await r.json();
      if (r.ok) {
        const list: Draft[] = d.drafts || [];
        setDrafts(list);
        if (list.length === 0) setShowPicker(true);
      }
    } catch {
      setShowPicker(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin/dashboard");
      return;
    }
    loadSuppliers();
    loadDrafts();
  }, []);

  if (user.role !== "owner") return null;

  const createSupplier = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const r = await fetch(INVOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_supplier", name }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Ошибка", variant: "destructive" });
        return;
      }
      setSupplier({ ...d.supplier, layouts: 0 });
      setShowPicker(false);
      setNewName("");
      loadSuppliers();
    } finally {
      setCreating(false);
    }
  };

  const openDraft = async (id: number) => {
    try {
      const r = await fetch(`${INVOICE_URL}?action=draft&id=${id}`);
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Черновик недоступен", variant: "destructive" });
        loadDrafts();
        return;
      }
      const dr = d.draft;
      const items: Item[] = dr.rows_data || [];
      setSupplier(
        dr.supplier_id
          ? { id: dr.supplier_id, name: dr.supplier_name || "", layouts: 0 }
          : null,
      );
      setDraftId(dr.id);
      setResult({
        header_index: 0,
        header_signature: dr.header_signature || "",
        mapping: dr.mapping || {},
        columns: [],
        items,
        layout_used: false,
        file_name: dr.file_name || "",
        stats: {
          total: items.length,
          guessed_article: items.filter((i) => i.article_guessed).length,
          no_article: items.filter((i) => !i.article).length,
          price_mismatch: items.filter((i) => i.price_mismatch).length,
          no_price: items.filter((i) => i.price === null).length,
        },
      });
      setSavedId(dr.id);
    } catch {
      toast({ title: "Не удалось открыть черновик", variant: "destructive" });
    }
  };

  const removeDraft = async (id: number) => {
    await fetch(INVOICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "drop_draft", draft_id: id }),
    });
    const rest = drafts.filter((d) => d.id !== id);
    setDrafts(rest);
    if (rest.length === 0) setShowPicker(true);
  };

  const parseFile = async (b64: string, name: string, mapping?: Record<string, number>) => {
    setParsing(true);
    try {
      const r = await fetch(INVOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "parse",
          file: b64,
          file_name: name,
          supplier_id: supplier?.id,
          mapping,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Не смог разобрать счёт", variant: "destructive" });
        return;
      }
      setResult(d);
      setSavedId(null);
      if (!mapping) setDraftId(null);
    } catch {
      toast({ title: "Ошибка разбора", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result).split(",")[1];
      setFileData({ b64, name: f.name });
      parseFile(b64, f.name);
    };
    reader.readAsDataURL(f);
  };

  const remap = (field: string, colIndex: string) => {
    if (!result || !fileData) return;
    const mapping = { ...result.mapping };
    Object.keys(mapping).forEach((k) => {
      if (k === field) delete mapping[k];
    });
    if (colIndex !== "") {
      Object.keys(mapping).forEach((k) => {
        if (mapping[k] === Number(colIndex)) delete mapping[k];
      });
      mapping[field] = Number(colIndex);
    }
    parseFile(fileData.b64, fileData.name, mapping);
  };

  const confirm = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const r = await fetch(INVOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          supplier_id: supplier?.id,
          mapping: result.mapping,
          header_signature: result.header_signature,
          file_name: result.file_name,
          items: result.items,
          draft_id: draftId,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Не удалось сохранить", variant: "destructive" });
        return;
      }
      setSavedId(d.draft_id);
      setDraftId(d.draft_id);
      toast({ title: `Счёт разобран: ${d.saved} строк` });
      loadSuppliers();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setResult(null);
    setFileData(null);
    setSavedId(null);
    setDraftId(null);
    loadDrafts();
    setShowPicker(true);
  };

  const goBack = () => {
    if (matchId !== null) {
      setMatchId(null);
      loadDrafts();
      return;
    }
    if (result) {
      reset();
      return;
    }
    if (showPicker && drafts.length > 0) {
      setShowPicker(false);
      return;
    }
    navigate("/admin/dashboard");
  };

  const st = result?.stats;
  const sumOf = (items: Item[]) =>
    items.reduce((acc, i) => acc + (i.total ?? 0), 0);
  const money = (v: number) =>
    v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ago = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso + "Z").getTime()) / 60000);
    if (m < 1) return "только что";
    if (m < 60) return `${m} мин назад`;
    return `${Math.floor(m / 60)} ч назад`;
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <Icon name="ArrowLeft" size={20} />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Загрузка счетов</h1>
            {supplier && (
              <p className="text-xs text-muted-foreground">Поставщик: {supplier.name}</p>
            )}
          </div>
          {result && (
            <Button variant="outline" size="sm" onClick={reset}>
              Заново
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {matchId !== null && (
          <InvoiceMatch draftId={matchId} onBack={() => setMatchId(null)} />
        )}
        {matchId === null && showPicker && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-card p-6">
              <h2 className="text-lg font-semibold mb-1">Чей счёт?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Выберите поставщика — раскладка колонок подставится сама
              </p>

              {suppliers.length > 0 && (
                <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
                  {suppliers.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSupplier(s);
                        setShowPicker(false);
                      }}
                      className="w-full text-left px-4 py-3 rounded-xl border border-white/[0.08] hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.layouts > 0 ? `${s.layouts} сохранённых вариантов` : "без правил"}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-white/[0.08] pt-4">
                <p className="text-sm mb-2">Новый поставщик</p>
                <div className="flex gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createSupplier()}
                    placeholder="Название"
                  />
                  <Button onClick={createSupplier} disabled={creating || !newName.trim()}>
                    Создать
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {matchId === null && !showPicker && !result && drafts.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-medium mb-3">Незавершённые счета</p>
            <div className="space-y-2">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-white/[0.08] bg-card p-4 flex flex-wrap items-center gap-3"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">
                      {d.supplier_name || "Без поставщика"}
                      <span className="text-muted-foreground font-normal">
                        {" "}· {d.file_name}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {d.rows_count} строк · на сумму{" "}
                      <span className="text-foreground font-medium">
                        {money(d.total_sum)} ₽
                      </span>{" "}
                      · {ago(d.updated_at)}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => openDraft(d.id)}>
                    Продолжить
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMatchId(d.id)}>
                    Сопоставить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeDraft(d.id)}>
                    Убрать
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setShowPicker(true)}
            >
              <Icon name="Plus" size={16} className="mr-1" />
              Загрузить новый счёт
            </Button>
          </div>
        )}

        {matchId === null && !showPicker && !result && drafts.length === 0 && !loading && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className="rounded-2xl border-2 border-dashed border-white/[0.12] p-12 text-center cursor-pointer hover:bg-white/[0.03] transition-colors"
          >
            <Icon name="FileSpreadsheet" size={40} className="mx-auto mb-3 text-cyan-400" />
            <p className="font-medium mb-1">
              {parsing ? "Разбираю счёт..." : "Перетащите файл счёта или нажмите"}
            </p>
            <p className="text-sm text-muted-foreground">Excel: .xlsx или .xls</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>
        )}

        {matchId === null && result && st && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-card p-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="font-medium">Строк: {st.total}</span>
                <span className="font-medium">
                  Сумма счёта:{" "}
                  <span className="text-cyan-400">{money(sumOf(result.items))} ₽</span>
                </span>
                {result.layout_used && (
                  <span className="text-emerald-400">Раскладка узнана</span>
                )}
                {st.guessed_article > 0 && (
                  <span className="text-amber-400">
                    Артикул из названия: {st.guessed_article}
                  </span>
                )}
                {st.no_article > 0 && (
                  <span className="text-red-400">Без артикула: {st.no_article}</span>
                )}
                {st.no_price > 0 && (
                  <span className="text-red-400">Без цены: {st.no_price}</span>
                )}
                {st.price_mismatch > 0 && (
                  <span className="text-amber-400">
                    Цена ≠ колонке: {st.price_mismatch}
                  </span>
                )}
              </div>
            </div>

            {result.columns.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-card p-4">
              <p className="text-sm font-medium mb-3">
                Колонки — поправьте, если понял неверно
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground">{f.title}</label>
                    <select
                      value={result.mapping[f.key] ?? ""}
                      onChange={(e) => remap(f.key, e.target.value)}
                      className="w-full mt-1 h-9 rounded-lg bg-background border border-white/[0.08] px-2 text-sm"
                    >
                      <option value="">— нет —</option>
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
            )}

            <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Артикул</th>
                      <th className="px-3 py-2 text-left font-medium">Штрихкод</th>
                      <th className="px-3 py-2 text-left font-medium">Наименование</th>
                      <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                      <th className="px-3 py-2 text-right font-medium">Сумма</th>
                      <th className="px-3 py-2 text-right font-medium">Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.slice(0, 100).map((it, i) => (
                      <tr key={i} className="border-b border-white/[0.04]">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={it.article ? "" : "text-red-400"}>
                            {it.article || "—"}
                          </span>
                          {it.article_guessed && (
                            <span className="ml-1 text-[10px] text-amber-400">из назв.</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {it.barcode || "—"}
                        </td>
                        <td className="px-3 py-2">{it.name}</td>
                        <td className="px-3 py-2 text-right">{it.qty ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {it.total ?? "—"}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            it.price === null
                              ? "text-red-400"
                              : it.price_mismatch
                              ? "text-amber-400"
                              : ""
                          }`}
                        >
                          {it.price ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.items.length > 100 && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t border-white/[0.08]">
                  Показаны первые 100 из {result.items.length}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={confirm} disabled={saving || savedId !== null}>
                {savedId ? "Сохранено" : saving ? "Сохраняю..." : "Всё верно, сохранить"}
              </Button>
              {savedId && (
                <>
                  <Button variant="outline" onClick={() => setMatchId(savedId)}>
                    <Icon name="Search" size={16} />
                    <span className="ml-2">Сопоставить с каталогом</span>
                  </Button>
                  <span className="text-sm text-emerald-400">
                    Черновик зафиксирован, раскладка запомнена
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default InvoiceUpload;