import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const BULK_RESOLVE_URL = "https://functions.poehali.dev/793352cf-67e1-4127-8a2a-a47efa5e2630";
const TEMP_PRODUCTS_URL = "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";
const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";

interface RowInput {
  article: string;
  qty: string;
  price: string;
}

interface Candidate {
  product_id: number;
  name: string;
  article: string | null;
  price: number;
}

interface RowResult {
  status: "found" | "ambiguous" | "not_found" | "empty" | "pending";
  product_id?: number | null;
  temp_product_id?: number | null;
  name?: string;
  price?: number;
  candidates?: Candidate[];
  is_temp?: boolean;
}

interface DraftLine {
  product_id: number | null;
  temp_product_id?: number | null;
  name: string;
  article: string | null;
  brand?: string | null;
  quantity: number;
  price: number;
  is_temp?: boolean;
  has_uuid?: boolean;
  from_bulk?: boolean;
}

const EMPTY_ROW: RowInput = { article: "", qty: "", price: "" };
const INITIAL_ROWS = 20;

const OrderBulkPastePage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editId = id ? parseInt(id) : null;
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const DRAFT_KEY = editId ? `order_draft_${editId}` : "order_draft_new";

  const [rows, setRows] = useState<RowInput[]>(
    Array.from({ length: INITIAL_ROWS }, () => ({ ...EMPTY_ROW }))
  );
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [resolving, setResolving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [customerName, setCustomerName] = useState<string>("");

  const [newProductForRow, setNewProductForRow] = useState<number | null>(null);
  const [npBrand, setNpBrand] = useState("");
  const [npArticle, setNpArticle] = useState("");
  const [npPrice, setNpPrice] = useState("");
  const [npSaving, setNpSaving] = useState(false);

  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        if (d.customerName) setCustomerName(d.customerName);
      } catch { /* ignore */ }
    }
  }, [DRAFT_KEY]);

  const setCell = (rowIdx: number, field: keyof RowInput, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      while (next.length <= rowIdx) next.push({ ...EMPTY_ROW });
      next[rowIdx] = { ...next[rowIdx], [field]: value };
      while (next.length < INITIAL_ROWS) next.push({ ...EMPTY_ROW });
      const last = next[next.length - 1];
      if (last.article || last.qty || last.price) {
        next.push({ ...EMPTY_ROW });
      }
      return next;
    });
    setResults((prev) => {
      if (!prev[rowIdx]) return prev;
      const next = { ...prev };
      delete next[rowIdx];
      return next;
    });
  };

  const handlePaste = (rowIdx: number, colIdx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n");
    while (lines.length && lines[lines.length - 1] === "") lines.pop();

    setRows((prev) => {
      const next = [...prev];
      const cols: (keyof RowInput)[] = ["article", "qty", "price"];
      lines.forEach((line, li) => {
        const cells = line.split("\t");
        const targetRow = rowIdx + li;
        while (next.length <= targetRow) next.push({ ...EMPTY_ROW });
        const row = { ...next[targetRow] };
        cells.forEach((cell, ci) => {
          const targetCol = colIdx + ci;
          if (targetCol < cols.length) {
            row[cols[targetCol]] = cell.trim();
          }
        });
        next[targetRow] = row;
      });
      const lastIdx = rowIdx + lines.length - 1;
      if (lastIdx >= next.length - 1) {
        next.push({ ...EMPTY_ROW });
      }
      return next;
    });
    setResults({});
  };

  const handleKeyDown = (rowIdx: number, colIdx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = e.key;
    let nextRow = rowIdx;
    let nextCol = colIdx;
    if (key === "Enter" || (key === "ArrowDown")) {
      nextRow = rowIdx + 1;
    } else if (key === "ArrowUp") {
      nextRow = Math.max(0, rowIdx - 1);
    } else if (key === "ArrowRight" && (e.currentTarget.selectionStart === e.currentTarget.value.length)) {
      nextCol = Math.min(2, colIdx + 1);
    } else if (key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
      nextCol = Math.max(0, colIdx - 1);
    } else if (key === "Tab") {
      return;
    } else {
      return;
    }
    e.preventDefault();
    const ref = cellRefs.current[`${nextRow}-${nextCol}`];
    if (ref) {
      ref.focus();
      ref.select();
    }
  };

  const filledRows = rows
    .map((r, idx) => ({ ...r, idx }))
    .filter((r) => r.article.trim() !== "");

  const resolveAll = async () => {
    if (filledRows.length === 0) {
      toast({ title: "Нет данных", description: "Заполните хотя бы один артикул", variant: "destructive" });
      return;
    }
    setResolving(true);
    try {
      const articles = filledRows.map((r) => r.article.trim());
      const resp = await fetch(BULK_RESOLVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ articles, customer_name: customerName }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Ошибка", description: data.error || "Не удалось распознать", variant: "destructive" });
        return;
      }
      const newResults: Record<number, RowResult> = {};
      type ApiResult = {
        article: string;
        status: "found" | "ambiguous" | "not_found" | "empty";
        product_id?: number;
        name?: string;
        price?: number;
        candidates?: Candidate[];
      };
      ((data.results as ApiResult[]) || []).forEach((res, i) => {
        const rowIdx = filledRows[i].idx;
        if (res.status === "found") {
          newResults[rowIdx] = {
            status: "found",
            product_id: res.product_id,
            name: res.name,
            price: res.price,
          };
        } else if (res.status === "ambiguous") {
          newResults[rowIdx] = {
            status: "ambiguous",
            candidates: res.candidates || [],
          };
        } else if (res.status === "not_found") {
          newResults[rowIdx] = { status: "not_found" };
        }
      });
      setResults(newResults);
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setResolving(false);
    }
  };

  const pickCandidate = (rowIdx: number, c: Candidate) => {
    setResults((prev) => ({
      ...prev,
      [rowIdx]: {
        status: "found",
        product_id: c.product_id,
        name: c.name,
        price: c.price,
      },
    }));
  };

  const removeRow = (rowIdx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== rowIdx));
    setResults((prev) => {
      const next: Record<number, RowResult> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = parseInt(k);
        if (ki < rowIdx) next[ki] = v;
        else if (ki > rowIdx) next[ki - 1] = v;
      });
      return next;
    });
  };

  const openNewProductForm = (rowIdx: number) => {
    setNewProductForRow(rowIdx);
    setNpBrand("");
    setNpArticle(rows[rowIdx]?.article || "");
    setNpPrice(rows[rowIdx]?.price || "");
  };

  const saveNewProduct = async () => {
    if (newProductForRow == null) return;
    if (!npBrand.trim() || !npArticle.trim()) {
      toast({ title: "Заполните бренд и артикул", variant: "destructive" });
      return;
    }
    setNpSaving(true);
    try {
      const qty = parseFloat(rows[newProductForRow]?.qty || "1") || 1;
      const price = parseFloat(npPrice || "0") || 0;
      const resp = await fetch(TEMP_PRODUCTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          brand: npBrand.trim(),
          article: npArticle.trim(),
          quantity: qty,
          price: price,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Ошибка", description: data.error || "Не удалось создать товар", variant: "destructive" });
        return;
      }
      const tempId = data.id || data.item?.id;
      setRows((prev) => {
        const next = [...prev];
        next[newProductForRow] = { ...next[newProductForRow], article: npArticle.trim(), price: String(price) };
        return next;
      });
      setResults((prev) => ({
        ...prev,
        [newProductForRow]: {
          status: "found",
          temp_product_id: tempId,
          name: `${npBrand.trim()} ${npArticle.trim()}`,
          price: price,
          is_temp: true,
        },
      }));
      setNewProductForRow(null);
      toast({ title: "Товар создан" });
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setNpSaving(false);
    }
  };

  const readyCount = Object.values(results).filter((r) => r.status === "found").length;

  const transferToOrder = async () => {
    if (readyCount === 0) {
      toast({ title: "Нет готовых строк для переноса", variant: "destructive" });
      return;
    }
    setTransferring(true);
    try {
      const newLines: DraftLine[] = [];
      const sortedKeys = Object.keys(results)
        .map((k) => parseInt(k))
        .sort((a, b) => a - b);
      sortedKeys.forEach((rowIdx) => {
        const res = results[rowIdx];
        if (res.status !== "found") return;
        const row = rows[rowIdx];
        if (!row) return;
        const qty = parseFloat(row.qty.replace(",", ".")) || 1;
        const manualPrice = parseFloat((row.price || "").replace(",", "."));
        const price = !isNaN(manualPrice) && manualPrice > 0 ? manualPrice : (res.price || 0);
        newLines.push({
          product_id: res.is_temp ? null : (res.product_id || null),
          temp_product_id: res.is_temp ? (res.temp_product_id || null) : null,
          name: res.name || "",
          article: row.article.trim(),
          quantity: qty,
          price: price,
          is_temp: !!res.is_temp,
          has_uuid: false,
          from_bulk: true,
        });
      });

      // Порядок как при ручном добавлении: последняя строка пакета — сверху
      const reversedNew = [...newLines].reverse();

      // Базовые строки: при редактировании сохранённой заявки — берём из БД,
      // чтобы не потерять существующие позиции, иначе из черновика
      let existingLines: DraftLine[] = [];
      const draft = localStorage.getItem(DRAFT_KEY);
      let parsed: Record<string, unknown> = {};
      try { parsed = draft ? JSON.parse(draft) : {}; } catch { parsed = {}; }

      if (editId) {
        try {
          const resp = await fetch(`${ORDERS_URL}?id=${editId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await resp.json();
          if (resp.ok && data.order) {
            const draftLines: DraftLine[] = Array.isArray(parsed.lines) ? (parsed.lines as DraftLine[]) : [];
            const orderLines: DraftLine[] = (data.order.items || []).map((item: {
              product_id: number | null; name: string; article: string | null;
              quantity: number; price: number; is_temp?: boolean;
              temp_product_id?: number | null; has_uuid?: boolean; from_bulk?: boolean;
            }) => ({
              product_id: item.product_id,
              name: item.name,
              article: item.article,
              quantity: item.quantity,
              price: item.price,
              is_temp: item.is_temp,
              temp_product_id: item.temp_product_id,
              has_uuid: item.has_uuid,
              from_bulk: item.from_bulk,
            }));
            // Если в черновике больше строк, чем в БД — пользователь редактировал; берём черновик
            existingLines = draftLines.length >= orderLines.length ? draftLines : orderLines;
          }
        } catch {
          existingLines = Array.isArray(parsed.lines) ? (parsed.lines as DraftLine[]) : [];
        }
      } else {
        existingLines = Array.isArray(parsed.lines) ? (parsed.lines as DraftLine[]) : [];
      }

      parsed.lines = [...reversedNew, ...existingLines];
      localStorage.setItem(DRAFT_KEY, JSON.stringify(parsed));

      toast({ title: `Перенесено: ${newLines.length}` });
      navigate(editId ? `/admin/orders/${editId}/edit` : "/admin/orders/create");
    } finally {
      setTransferring(false);
    }
  };

  const cancel = () => {
    navigate(editId ? `/admin/orders/${editId}/edit` : "/admin/orders/create");
  };

  const renderStatus = (rowIdx: number) => {
    const res = results[rowIdx];
    if (!res) return <span className="text-xs text-muted-foreground">—</span>;
    if (res.status === "found") {
      return (
        <span className="text-xs text-green-400 flex items-center gap-1">
          <Icon name="CheckCircle2" size={12} />
          {res.is_temp ? "новый товар" : "найден"}
        </span>
      );
    }
    if (res.status === "ambiguous") {
      return (
        <select
          className="bg-secondary border border-yellow-500/40 rounded px-1 py-0.5 text-xs w-full"
          onChange={(e) => {
            const id = parseInt(e.target.value);
            const c = res.candidates?.find((x) => x.product_id === id);
            if (c) pickCandidate(rowIdx, c);
          }}
          defaultValue=""
        >
          <option value="" disabled>Выбрать ({res.candidates?.length})</option>
          {res.candidates?.map((c) => (
            <option key={c.product_id} value={c.product_id}>{c.name}</option>
          ))}
        </select>
      );
    }
    if (res.status === "not_found") {
      return (
        <button
          className="text-xs text-red-400 hover:text-red-300 underline"
          onClick={() => openNewProductForm(rowIdx)}
        >
          Не найден — создать
        </button>
      );
    }
    return null;
  };

  const renderProductCell = (rowIdx: number) => {
    const res = results[rowIdx];
    if (!res) return <span className="text-xs text-muted-foreground">—</span>;
    if (res.status === "found") return <span className="text-xs">{res.name}</span>;
    if (res.status === "ambiguous") return <span className="text-xs text-yellow-400">несколько совпадений</span>;
    if (res.status === "not_found") return <span className="text-xs text-red-400">не найден</span>;
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={cancel}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold">
              Пакетный ввод позиций {editId ? `в заявку #${editId}` : "в новую заявку"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resolveAll} disabled={resolving}>
              {resolving ? <Icon name="Loader2" size={14} className="animate-spin mr-1" /> : <Icon name="Search" size={14} className="mr-1" />}
              Распознать
            </Button>
            <Button size="sm" onClick={transferToOrder} disabled={transferring || readyCount === 0}>
              <Icon name="ArrowRightCircle" size={14} className="mr-1" />
              Перенести в заявку ({readyCount})
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-4 py-4 flex-1">
        <div className="text-xs text-muted-foreground mb-3">
          Вставьте данные из Excel/Google Sheets в таблицу. Колонки: <b>Артикул</b>, <b>Кол-во</b>, <b>Цена</b> (опционально).
          Если цена пустая — будет применено правило ценообразования для покупателя «{customerName || "не указан"}».
        </div>

        <div className="overflow-x-auto border border-white/[0.08] rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04]">
              <tr>
                <th className="text-left px-2 py-2 w-10 text-xs text-muted-foreground">#</th>
                <th className="text-left px-2 py-2 w-40 text-xs text-muted-foreground">Артикул</th>
                <th className="text-left px-2 py-2 w-24 text-xs text-muted-foreground">Кол-во</th>
                <th className="text-left px-2 py-2 w-24 text-xs text-muted-foreground">Цена</th>
                <th className="text-left px-2 py-2 text-xs text-muted-foreground">Найденный товар</th>
                <th className="text-left px-2 py-2 w-44 text-xs text-muted-foreground">Статус</th>
                <th className="text-left px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const res = results[rowIdx];
                const rowClass =
                  res?.status === "found" ? "bg-green-500/[0.04]" :
                  res?.status === "ambiguous" ? "bg-yellow-500/[0.04]" :
                  res?.status === "not_found" ? "bg-red-500/[0.04]" : "";
                return (
                  <tr key={rowIdx} className={`border-t border-white/[0.04] ${rowClass}`}>
                    <td className="px-2 py-1 text-xs text-muted-foreground">{rowIdx + 1}</td>
                    {(["article", "qty", "price"] as const).map((field, colIdx) => (
                      <td key={field} className="px-1 py-1">
                        <input
                          ref={(el) => { cellRefs.current[`${rowIdx}-${colIdx}`] = el; }}
                          type="text"
                          value={row[field]}
                          onChange={(e) => setCell(rowIdx, field, e.target.value)}
                          onPaste={(e) => handlePaste(rowIdx, colIdx, e)}
                          onKeyDown={(e) => handleKeyDown(rowIdx, colIdx, e)}
                          className="w-full bg-transparent border border-white/[0.06] rounded px-2 py-1 text-sm focus:outline-none focus:border-primary"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1">{renderProductCell(rowIdx)}</td>
                    <td className="px-2 py-1">{renderStatus(rowIdx)}</td>
                    <td className="px-1 py-1">
                      {(row.article || row.qty || row.price) && (
                        <button
                          className="text-muted-foreground hover:text-red-400"
                          onClick={() => removeRow(rowIdx)}
                          title="Удалить строку"
                        >
                          <Icon name="X" size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Заполнено строк: {filledRows.length} · Готово к переносу: <b className="text-green-400">{readyCount}</b>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancel}>Отмена</Button>
            <Button size="sm" onClick={transferToOrder} disabled={readyCount === 0 || transferring}>
              Перенести в заявку ({readyCount})
            </Button>
          </div>
        </div>
      </main>

      {newProductForRow !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setNewProductForRow(null)}>
          <div className="bg-card border border-white/[0.08] rounded-xl p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Создать новый товар</h2>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setNewProductForRow(null)}>
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">Бренд</label>
                <Input value={npBrand} onChange={(e) => setNpBrand(e.target.value)} placeholder="Бренд" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Артикул</label>
                <Input value={npArticle} onChange={(e) => setNpArticle(e.target.value)} placeholder="Артикул" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Цена</label>
                <Input value={npPrice} onChange={(e) => setNpPrice(e.target.value)} placeholder="0" inputMode="decimal" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setNewProductForRow(null)}>Отмена</Button>
              <Button size="sm" onClick={saveNewProduct} disabled={npSaving}>
                {npSaving && <Icon name="Loader2" size={14} className="animate-spin mr-1" />}
                Создать
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderBulkPastePage;