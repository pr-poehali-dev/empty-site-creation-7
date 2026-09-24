import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import {
  REC_FIELDS,
  parseReceivingFile,
  buildRows,
  type RecParsed,
  type RecRow,
} from "@/lib/receivingParse";
import { useReceivingPerms, permHeaders } from "@/hooks/useReceivingPerms";

const REC_URL = "https://functions.poehali.dev/9c11ad88-c1f5-4a4a-8272-fee5612f5d80";
const CHUNK = 1000;

interface Supplier {
  id: number;
  name: string;
  layouts: number;
  items: number;
}

interface Upload {
  id: number;
  file_name: string;
  uploaded_by_name: string | null;
  supplier_name: string | null;
  rows_read: number;
  rows_added: number;
  rows_skipped: number;
  created_at: string;
}

const ReceivingUpload = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const fileRef = useRef<HTMLInputElement>(null);
  const { loading: permsLoading, can, expired } = useReceivingPerms();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [parsed, setParsed] = useState<RecParsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [layoutUsed, setLayoutUsed] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [rows, setRows] = useState<RecRow[] | null>(null);
  const [known, setKnown] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);

  const loadSuppliers = useCallback(async () => {
    const r = await fetch(`${REC_URL}?action=suppliers`);
    const d = await r.json();
    setSuppliers(d.suppliers || []);
  }, []);

  const loadUploads = useCallback(async () => {
    const r = await fetch(`${REC_URL}?action=uploads`);
    const d = await r.json();
    setUploads(d.uploads || []);
  }, []);

  useEffect(() => {
    loadSuppliers();
    loadUploads();
  }, [loadSuppliers, loadUploads]);

  const createSupplier = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(REC_URL, {
        method: "POST",
        headers: permHeaders(),
        body: JSON.stringify({ action: "create_supplier", name: newName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: d.error || "Не получилось", variant: "destructive" });
        return;
      }
      setSupplier({ ...d.supplier, layouts: 0, items: 0 });
      setShowPicker(false);
      setNewName("");
      loadSuppliers();
    } finally {
      setCreating(false);
    }
  };

  const onFile = async (f: File) => {
    setParsing(true);
    setRows(null);
    setKnown(null);
    setConfirmed(false);
    setDone(null);
    try {
      const p = await parseReceivingFile(f);
      setParsed(p);
      setFileName(f.name);

      const auto: Record<string, number> = {};
      p.columns.forEach((c) => {
        if (c.field) auto[c.field] = c.index;
      });

      let used = false;
      if (supplier) {
        const r = await fetch(REC_URL, {
          method: "POST",
          headers: permHeaders(),
          body: JSON.stringify({
            action: "get_layout",
            supplier_id: supplier.id,
            signature: p.signature,
          }),
        });
        const d = await r.json();
        if (d.layout?.mapping) {
          Object.assign(auto, d.layout.mapping);
          used = true;
        }
      }
      setMapping(auto);
      setLayoutUsed(used);
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Не смог прочитать файл",
        variant: "destructive",
      });
    } finally {
      setParsing(false);
    }
  };

  const remap = (field: string, colIndex: string) => {
    const next = { ...mapping };
    delete next[field];
    if (colIndex !== "") {
      Object.keys(next).forEach((k) => {
        if (next[k] === Number(colIndex)) delete next[k];
      });
      next[field] = Number(colIndex);
    }
    setMapping(next);
    setRows(null);
    setKnown(null);
    setConfirmed(false);
  };

  const check = async () => {
    if (!parsed) return;
    setChecking(true);
    try {
      const built = buildRows(parsed, mapping);
      setRows(built);
      if (built.length === 0) {
        toast({ title: "Ни одной строки не собралось", variant: "destructive" });
        return;
      }
      let total = 0;
      for (let i = 0; i < built.length; i += 5000) {
        const codes = built.slice(i, i + 5000).map((r) => r.supplier_barcode);
        const r = await fetch(REC_URL, {
          method: "POST",
          headers: permHeaders(),
          body: JSON.stringify({ action: "check_barcodes", barcodes: codes }),
        });
        const d = await r.json();
        total += d.known || 0;
      }
      setKnown(total);
    } finally {
      setChecking(false);
    }
  };

  const upload = async () => {
    if (!parsed || !rows || !supplier) return;
    setProgress({ done: 0, total: rows.length });
    try {
      const startRes = await fetch(REC_URL, {
        method: "POST",
        headers: permHeaders(),
        body: JSON.stringify({
          action: "start_upload",
          supplier_id: supplier.id,
          file_name: fileName,
          rows_read: rows.length,
          user_name: user.name || user.full_name || null,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) {
        toast({ title: startData.error || "Не удалось начать", variant: "destructive" });
        setProgress(null);
        return;
      }
      const uploadId = startData.upload_id;

      let added = 0;
      let skipped = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const r = await fetch(REC_URL, {
          method: "POST",
          headers: permHeaders(),
          body: JSON.stringify({
            action: "push_chunk",
            upload_id: uploadId,
            supplier_id: supplier.id,
            rows: chunk,
          }),
        });
        const d = await r.json();
        if (!r.ok) {
          toast({
            title: `Оборвалось на строке ${i}`,
            description: d.error || "Загрузку можно удалить в журнале и повторить",
            variant: "destructive",
          });
          setProgress(null);
          loadUploads();
          return;
        }
        added += d.added || 0;
        skipped += d.skipped || 0;
        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
      }

      await fetch(REC_URL, {
        method: "POST",
        headers: permHeaders(),
        body: JSON.stringify({
          action: "save_layout",
          supplier_id: supplier.id,
          signature: parsed.signature,
          mapping,
        }),
      });

      setDone({ added, skipped });
      setProgress(null);
      loadUploads();
      loadSuppliers();
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" });
      setProgress(null);
    }
  };

  const dropUpload = async (id: number) => {
    await fetch(REC_URL, {
      method: "POST",
      headers: permHeaders(),
      body: JSON.stringify({ action: "drop_upload", upload_id: id }),
    });
    loadUploads();
    loadSuppliers();
    toast({ title: "Загрузка удалена" });
  };

  const reset = () => {
    setParsed(null);
    setRows(null);
    setKnown(null);
    setConfirmed(false);
    setDone(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const missingRequired = REC_FIELDS.filter(
    (f) => f.required && mapping[f.key] === undefined,
  );

  const fieldTitle = (key: string) => REC_FIELDS.find((f) => f.key === key)?.title || key;

  const emptyCounts = rows
    ? REC_FIELDS.map((f) => ({
        title: f.title,
        empty: rows.filter((r) => r[f.key] === null || r[f.key] === "").length,
      })).filter((x) => x.empty > 0)
    : [];

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="LogIn" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium mb-1">Войдите заново</p>
          <p className="text-sm text-muted-foreground mb-4">Срок входа истёк</p>
          <Button onClick={() => navigate("/admin")}>Войти</Button>
        </div>
      </div>
    );
  }

  if (!permsLoading && !can("upload_files")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="Lock" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium mb-1">Загрузка файлов не открыта</p>
          <p className="text-sm text-muted-foreground mb-4">
            Обратитесь к владельцу — он выдаёт права
          </p>
          <Button variant="outline" onClick={() => navigate("/admin/receiving")}>
            К приёмкам
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/receiving")}>
            <Icon name="ArrowLeft" size={20} />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Загрузка приёмки</h1>
            {supplier && (
              <p className="text-xs text-muted-foreground">Поставщик: {supplier.name}</p>
            )}
          </div>
          {parsed && (
            <Button variant="outline" size="sm" onClick={reset}>
              Заново
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {showPicker && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-card p-6">
              <h2 className="text-lg font-semibold mb-1">Чей файл?</h2>
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
                        {s.layouts > 0 ? `${s.layouts} схем колонок` : "без схем"} ·{" "}
                        {s.items} единиц в базе
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

        {!showPicker && !parsed && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-6">
            <p className="text-sm text-muted-foreground mb-4">
              Файл Excel от поставщика. Колонки узнаются сами, при необходимости
              поправите вручную.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
                <Icon name="Upload" size={16} className="mr-2" />
                {parsing ? "Читаю файл..." : "Выбрать файл"}
              </Button>
              <Button variant="outline" onClick={() => setShowPicker(true)}>
                Сменить поставщика
              </Button>
            </div>
          </div>
        )}

        {parsed && !done && (
          <>
            <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold">Колонки файла</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fileName} · лист «{parsed.sheetName}» ·{" "}
                    {parsed.rows.length - parsed.headerIndex - 1} строк данных
                  </p>
                </div>
                {layoutUsed && (
                  <span className="text-xs px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 whitespace-nowrap">
                    схема узнана
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {parsed.columns.map((c) => {
                  const assigned = Object.keys(mapping).find((k) => mapping[k] === c.index);
                  return (
                    <div
                      key={c.index}
                      className={`rounded-xl border p-3 ${
                        assigned
                          ? "border-violet-500/30 bg-violet-500/[0.06]"
                          : "border-white/[0.08]"
                      }`}
                    >
                      <div className="font-medium text-sm">{c.title}</div>
                      {c.sample && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          пример: {c.sample}
                        </div>
                      )}
                      <select
                        value={assigned || ""}
                        onChange={(e) => {
                          if (assigned && e.target.value !== assigned) remap(assigned, "");
                          if (e.target.value) remap(e.target.value, String(c.index));
                        }}
                        className="mt-2 w-full bg-background border border-white/[0.12] rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">— не берём —</option>
                        {REC_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.title}
                            {f.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
              <h2 className="font-semibold mb-3">Проверка перед записью</h2>

              {missingRequired.length > 0 && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm mb-4">
                  Не сопоставлено обязательное:{" "}
                  {missingRequired.map((f) => f.title).join(", ")}
                </div>
              )}

              {!rows && (
                <Button
                  onClick={check}
                  disabled={checking || missingRequired.length > 0}
                  variant="outline"
                >
                  {checking ? "Проверяю..." : "Проверить"}
                </Button>
              )}

              {rows && known !== null && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-xl bg-white/[0.04] p-3">
                      <div className="text-xs text-muted-foreground">Прочитано строк</div>
                      <div className="text-xl font-semibold">{rows.length}</div>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] p-3">
                      <div className="text-xs text-muted-foreground">Новых</div>
                      <div className="text-xl font-semibold text-emerald-300">
                        {rows.length - known}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] p-3">
                      <div className="text-xs text-muted-foreground">Уже есть в базе</div>
                      <div className="text-xl font-semibold text-amber-300">{known}</div>
                    </div>
                  </div>

                  {emptyCounts.length > 0 && (
                    <div className="text-xs text-muted-foreground mb-4">
                      Незаполненные поля:{" "}
                      {emptyCounts.map((x) => `${x.title} — ${x.empty}`).join(", ")}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground mb-4">
                    Взятые колонки:{" "}
                    {Object.keys(mapping)
                      .map((k) => fieldTitle(k))
                      .join(", ")}
                  </div>

                  {!progress && (
                    <>
                      <label className="flex items-center gap-3 mb-4 cursor-pointer">
                        <Checkbox
                          checked={confirmed}
                          onCheckedChange={(v) => setConfirmed(Boolean(v))}
                        />
                        <span className="text-sm">Подтверждаю загрузку</span>
                      </label>
                      <Button onClick={upload} disabled={!confirmed}>
                        <Icon name="Database" size={16} className="mr-2" />
                        Загрузить
                      </Button>
                    </>
                  )}

                  {progress && (
                    <div>
                      <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden mb-2">
                        <div
                          className="h-full bg-violet-500 transition-all"
                          style={{
                            width: `${Math.round((progress.done / progress.total) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Загружено {progress.done} из {progress.total}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {done && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="CircleCheck" size={20} className="text-emerald-400" />
              <h2 className="font-semibold">Загрузка завершена</h2>
            </div>
            <p className="text-sm">
              Добавлено единиц: <span className="font-semibold">{done.added}</span>
              {done.skipped > 0 && (
                <>
                  {" · "}пропущено как уже известные:{" "}
                  <span className="font-semibold">{done.skipped}</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Схема колонок сохранена — следующий такой файл разложится сам.
            </p>
            <Button className="mt-4" onClick={reset}>
              Загрузить ещё файл
            </Button>
          </div>
        )}

        {uploads.length > 0 && !parsed && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
            <h2 className="font-semibold mb-3">Журнал загрузок</h2>
            <div className="space-y-2">
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className="rounded-xl border border-white/[0.08] p-3 flex flex-wrap items-center gap-3"
                >
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-sm font-medium truncate">{u.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.supplier_name || "без поставщика"}
                      {u.uploaded_by_name ? ` · ${u.uploaded_by_name}` : ""} ·{" "}
                      {new Date(u.created_at + "Z").toLocaleString("ru-RU")}
                    </div>
                    <div className="text-xs mt-1">
                      прочитано {u.rows_read} · добавлено{" "}
                      <span className="text-emerald-300">{u.rows_added}</span>
                      {u.rows_skipped > 0 && (
                        <> · пропущено <span className="text-amber-300">{u.rows_skipped}</span></>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dropUpload(u.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Удалить
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ReceivingUpload;