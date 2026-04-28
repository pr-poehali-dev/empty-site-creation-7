# Блоки кодов

## Оглавление

1. [Форма создания временного товара](#1-форма-создания-временного-товара)
2. [Рабочий ввод списком, только артикул](#2-рабочий-ввод-списком-только-артикул)

## 1. Форма создания временного товара

**Описание:** Форма с 4 полями (бренд, артикул, количество, цена). Бренд — input с выпадающим списком существующих брендов. Артикул — input с подсказками из каталога и temp_products. Закрытие выпадающих списков — через ref + document mousedown listener.

**Состояния:**
```tsx
const [showTempForm, setShowTempForm] = useState(false);
const [tempBrand, setTempBrand] = useState("");
const [tempArticle, setTempArticle] = useState("");
const [tempQty, setTempQty] = useState("1");
const [tempPrice, setTempPrice] = useState("");
const [allBrands, setAllBrands] = useState<string[]>([]);
const [showBrandList, setShowBrandList] = useState(false);
const [articleSuggestions, setArticleSuggestions] = useState<{id: number; name: string; article: string | null; brand: string | null}[]>([]);
const [showArticleList, setShowArticleList] = useState(false);
const brandRef = useRef<HTMLDivElement>(null);
const articleRef = useRef<HTMLDivElement>(null);
const articleDebounceRef = useRef<ReturnType<typeof setTimeout>>();
const [savingTemp, setSavingTemp] = useState(false);
```

**Загрузка брендов (из products + temp_products):**
```tsx
const loadBrands = useCallback(async () => {
  try {
    const [prodResp, tempResp] = await Promise.all([
      fetch(`${PRODUCTS_URL}?search=&per_page=200`, { headers: authHeaders }),
      fetch(`${TEMP_PRODUCTS_URL}?per_page=200`, { headers: authHeaders }),
    ]);
    const prodData = await prodResp.json();
    const tempData = await tempResp.json();
    const prodBrands = (prodData.items || []).map((p) => p.brand).filter(Boolean);
    const tempBrands = (tempData.items || []).map((p) => p.brand).filter(Boolean);
    setAllBrands([...new Set([...prodBrands, ...tempBrands])].sort());
  } catch { /* ignore */ }
}, [token]);
```

**Поиск артикулов (из products + temp_products):**
```tsx
const searchArticles = (value: string) => {
  setTempArticle(value);
  if (articleDebounceRef.current) clearTimeout(articleDebounceRef.current);
  if (!value.trim() || value.trim().length < 2) { setArticleSuggestions([]); return; }
  articleDebounceRef.current = setTimeout(async () => {
    try {
      const [prodResp, tempResp] = await Promise.all([
        fetch(`${PRODUCTS_URL}?search=${encodeURIComponent(value)}&search_type=article&per_page=8`, { headers: authHeaders }),
        fetch(`${TEMP_PRODUCTS_URL}?search=${encodeURIComponent(value)}&per_page=5`, { headers: authHeaders }),
      ]);
      const prodData = await prodResp.json();
      const tempData = await tempResp.json();
      const prodItems = prodResp.ok ? (prodData.items || []) : [];
      const tempItems = tempResp.ok ? (tempData.items || []).map((t) => ({ id: t.id, name: `${t.brand} ${t.article}`, article: t.article, brand: t.brand })) : [];
      setArticleSuggestions([...tempItems, ...prodItems]);
    } catch { /* ignore */ }
  }, 300);
};
```

**Фильтрация брендов:**
```tsx
const filteredBrands = allBrands.filter(b => b.toLowerCase().includes(tempBrand.toLowerCase()));
```

**Закрытие выпадающих через mousedown:**
```tsx
useEffect(() => {
  const handleClick = (e: MouseEvent) => {
    if (brandRef.current && !brandRef.current.contains(e.target as Node)) setShowBrandList(false);
    if (articleRef.current && !articleRef.current.contains(e.target as Node)) setShowArticleList(false);
  };
  document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, []);
```

**JSX формы:**
```tsx
{showTempForm && (
  <div className="mb-3 p-3 rounded-xl border border-red-500/30 bg-red-950/20">
    <p className="text-xs text-red-400 mb-2 font-medium">Временный товар</p>
    <div className="grid grid-cols-2 gap-2 mb-2">
      <div className="relative" ref={brandRef}>
        <Input
          placeholder="Бренд *"
          value={tempBrand}
          onChange={(e) => { setTempBrand(e.target.value); setShowBrandList(true); }}
          onFocus={() => setShowBrandList(true)}
          className="h-9 rounded-lg bg-secondary border-white/[0.08] text-sm"
        />
        {showBrandList && filteredBrands.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-40 overflow-y-auto shadow-lg">
            {filteredBrands.map((b) => (
              <button key={b} className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0"
                onClick={() => { setTempBrand(b); setShowBrandList(false); }}
              >{b}</button>
            ))}
          </div>
        )}
      </div>
      <div className="relative" ref={articleRef}>
        <Input
          placeholder="Артикул *"
          value={tempArticle}
          onChange={(e) => { searchArticles(e.target.value); setShowArticleList(true); }}
          onFocus={() => setShowArticleList(true)}
          className="h-9 rounded-lg bg-secondary border-white/[0.08] text-sm"
        />
        {showArticleList && articleSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-40 overflow-y-auto shadow-lg">
            {articleSuggestions.map((item) => (
              <button key={item.id} className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0"
                onClick={() => selectArticleFromExisting(item)}
              >
                <span className="block">{item.article}</span>
                <span className="text-xs text-muted-foreground">{item.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 mb-2">
      <Input placeholder="Количество *" type="number" value={tempQty}
        onChange={(e) => setTempQty(e.target.value)}
        className="h-9 rounded-lg bg-secondary border-white/[0.08] text-sm"
      />
      <Input placeholder="Цена *" type="number" value={tempPrice}
        onChange={(e) => setTempPrice(e.target.value)}
        className="h-9 rounded-lg bg-secondary border-white/[0.08] text-sm"
      />
    </div>
    <div className="flex gap-2">
      <Button size="sm" className="rounded-lg flex-1" onClick={saveTempProduct} disabled={savingTemp}>
        {savingTemp ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
        <span className="ml-1">Добавить</span>
      </Button>
      <Button size="sm" variant="ghost" className="rounded-lg"
        onClick={() => { setShowTempForm(false); setTempBrand(""); setTempArticle(""); setTempQty("1"); setTempPrice(""); }}
      >Отмена</Button>
    </div>
  </div>
)}
```

## 2. Рабочий ввод списком, только артикул

**Описание:** Универсальная страница пакетного ввода (`/admin/shared/bulk-paste`). Принимает `resolve_request` из sessionStorage (returnTo, customerName, authHeaders), отдаёт `resolve_result` обратно через sessionStorage. Поиск только по артикулу через бэкенд `wholesale-orders-bulk-resolve`. Поддержка вставки таблицы из Excel/Google Sheets, навигация стрелками/Enter по ячейкам, статусы found/ambiguous/not_found, создание временного товара прямо из строки.

**Файл:** `src/pages/shared/BulkPastePage.tsx`

```tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const BULK_RESOLVE_URL = "https://functions.poehali.dev/793352cf-67e1-4127-8a2a-a47efa5e2630";
const TEMP_PRODUCTS_URL = "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";
const BRANDS_URL = "https://functions.poehali.dev/6406512c-44db-46fe-bc84-7ab460f71dfe";

interface RowInput {
  article: string;
  qty: string;
  price: string;
}

interface Candidate {
  product_id?: number;
  temp_product_id?: number;
  name: string;
  article: string | null;
  price: number;
  is_temp?: boolean;
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

interface ResolvedItem {
  product_id: number | null;
  temp_product_id?: number | null;
  name: string;
  article: string | null;
  brand?: string | null;
  base_price: number;
  is_temp: boolean;
  has_uuid?: boolean;
  quantity: number;
  from_bulk?: boolean;
}

interface ResolveRequest {
  returnTo: string;
  context?: "order" | "return";
  wholesalerId?: number | null;
  customerName?: string;
  authHeaders?: Record<string, string>;
}

const EMPTY_ROW: RowInput = { article: "", qty: "", price: "" };
const INITIAL_ROWS = 20;

const BulkPastePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const reqRaw = typeof window !== "undefined" ? sessionStorage.getItem("resolve_request") : null;
  const req: ResolveRequest = reqRaw ? JSON.parse(reqRaw) : { returnTo: "/admin/orders" };
  const token = localStorage.getItem("auth_token") || "";
  const authHeaders = req.authHeaders || {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const customerName = req.customerName || "";

  const [rows, setRows] = useState<RowInput[]>(
    Array.from({ length: INITIAL_ROWS }, () => ({ ...EMPTY_ROW }))
  );
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [resolving, setResolving] = useState(false);

  const [newProductForRow, setNewProductForRow] = useState<number | null>(null);
  const [npBrand, setNpBrand] = useState("");
  const [npArticle, setNpArticle] = useState("");
  const [npPrice, setNpPrice] = useState("");
  const [npSaving, setNpSaving] = useState(false);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [showBrandList, setShowBrandList] = useState(false);
  const brandRef = useRef<HTMLDivElement>(null);

  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    fetch(`${BRANDS_URL}?names_only=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.items)) setAllBrands(d.items); })
      .catch(() => { /* ignore */ });
  }, [token]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (brandRef.current && !brandRef.current.contains(e.target as Node)) {
        setShowBrandList(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filteredBrands = allBrands.filter((b) =>
    b.toLowerCase().includes(npBrand.toLowerCase())
  ).slice(0, 50);

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
            const colName = cols[targetCol];
            let value = cell.trim();
            if (colName === "qty" || colName === "price") {
              value = value.replace(/[\s\u00A0]/g, "");
            }
            row[colName] = value;
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
    if (key === "Enter" || key === "ArrowDown") {
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
        headers: authHeaders,
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
        temp_product_id?: number;
        name?: string;
        price?: number;
        candidates?: Candidate[];
        is_temp?: boolean;
      };
      ((data.results as ApiResult[]) || []).forEach((res, i) => {
        const rowIdx = filledRows[i].idx;
        if (res.status === "found") {
          newResults[rowIdx] = {
            status: "found",
            product_id: res.is_temp ? null : res.product_id,
            temp_product_id: res.is_temp ? res.temp_product_id : null,
            name: res.name,
            price: res.price,
            is_temp: !!res.is_temp,
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
        product_id: c.is_temp ? null : (c.product_id || null),
        temp_product_id: c.is_temp ? (c.temp_product_id || null) : null,
        name: c.name,
        price: c.price,
        is_temp: !!c.is_temp,
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
      const price = parseFloat((npPrice || "0").replace(/[\s\u00A0]/g, "").replace(",", ".")) || 0;
      const brandTrim = npBrand.trim();
      const articleTrim = npArticle.trim();

      let tempId: number | null = null;
      let usedExisting = false;
      try {
        const dupResp = await fetch(`${TEMP_PRODUCTS_URL}?search=${encodeURIComponent(articleTrim)}&per_page=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const dupData = await dupResp.json();
        if (dupResp.ok && Array.isArray(dupData.items)) {
          const existing = dupData.items.find((it: { brand: string; article: string; id: number }) =>
            (it.brand || "").trim().toLowerCase() === brandTrim.toLowerCase() &&
            (it.article || "").trim().toLowerCase() === articleTrim.toLowerCase()
          );
          if (existing) {
            tempId = existing.id;
            usedExisting = true;
          }
        }
      } catch { /* ignore */ }

      if (!tempId) {
        const resp = await fetch(TEMP_PRODUCTS_URL, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ brand: brandTrim, article: articleTrim, price }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          toast({ title: "Ошибка", description: data.error || "Не удалось создать товар", variant: "destructive" });
          return;
        }
        tempId = data.id || data.item?.id;
      }

      setRows((prev) => {
        const next = [...prev];
        next[newProductForRow] = { ...next[newProductForRow], article: articleTrim, price: String(price) };
        return next;
      });
      setResults((prev) => ({
        ...prev,
        [newProductForRow]: {
          status: "found",
          temp_product_id: tempId,
          name: `${brandTrim} ${articleTrim}`,
          price,
          is_temp: true,
        },
      }));
      setNewProductForRow(null);
      toast({ title: usedExisting ? "Использован существующий товар" : "Товар создан" });
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setNpSaving(false);
    }
  };

  const readyCount = Object.values(results).filter((r) => r.status === "found").length;

  const finish = () => {
    if (readyCount === 0) {
      toast({ title: "Нет готовых строк для переноса", variant: "destructive" });
      return;
    }
    const items: ResolvedItem[] = [];
    const sortedKeys = Object.keys(results).map((k) => parseInt(k)).sort((a, b) => a - b);
    sortedKeys.forEach((rowIdx) => {
      const res = results[rowIdx];
      if (res.status !== "found") return;
      const row = rows[rowIdx];
      if (!row) return;
      const qty = parseFloat(row.qty.replace(/[\s\u00A0]/g, "").replace(",", ".")) || 1;
      const manualPrice = parseFloat((row.price || "").replace(/[\s\u00A0]/g, "").replace(",", "."));
      const price = !isNaN(manualPrice) && manualPrice > 0 ? manualPrice : (res.price || 0);
      items.push({
        product_id: res.is_temp ? null : (res.product_id || null),
        temp_product_id: res.is_temp ? (res.temp_product_id || null) : null,
        name: res.name || "",
        article: row.article.trim(),
        base_price: price,
        is_temp: !!res.is_temp,
        has_uuid: false,
        quantity: qty,
        from_bulk: true,
      });
    });

    sessionStorage.setItem("resolve_result", JSON.stringify({ source: "bulk", items }));
    sessionStorage.removeItem("resolve_request");
    toast({ title: `Перенесено: ${items.length}` });
    navigate(req.returnTo);
  };

  const cancel = () => {
    sessionStorage.removeItem("resolve_request");
    navigate(req.returnTo);
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
          className="bg-secondary border border-yellow-500/40 rounded px-1 py-0.5 text-xs"
          onChange={(e) => {
            const idx = parseInt(e.target.value);
            const c = res.candidates?.[idx];
            if (c) pickCandidate(rowIdx, c);
          }}
          defaultValue=""
        >
          <option value="" disabled>выберите</option>
          {(res.candidates || []).map((c, i) => (
            <option key={i} value={i}>
              {c.name} {c.is_temp ? "(новый)" : ""} — {c.price}
            </option>
          ))}
        </select>
      );
    }
    if (res.status === "not_found") {
      return (
        <button
          className="text-xs text-blue-400 hover:underline flex items-center gap-1"
          onClick={() => openNewProductForm(rowIdx)}
        >
          <Icon name="Plus" size={12} />
          создать
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
            <h1 className="text-lg font-semibold">Пакетный ввод позиций</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resolveAll} disabled={resolving}>
              {resolving ? <Icon name="Loader2" size={14} className="animate-spin mr-1" /> : <Icon name="Search" size={14} className="mr-1" />}
              Распознать
            </Button>
            <Button size="sm" onClick={finish} disabled={readyCount === 0}>
              <Icon name="ArrowRightCircle" size={14} className="mr-1" />
              Готово ({readyCount})
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-4 py-4 flex-1">
        <div className="text-xs text-muted-foreground mb-3">
          Вставьте данные из Excel/Google Sheets. Колонки: <b>Артикул</b>, <b>Кол-во</b>, <b>Цена</b> (опционально).
          {customerName && <> Поиск с учётом покупателя «{customerName}».</>}
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
            Заполнено строк: {filledRows.length} · Готово: <b className="text-green-400">{readyCount}</b>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancel}>Отмена</Button>
            <Button size="sm" onClick={finish} disabled={readyCount === 0}>
              Готово ({readyCount})
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
              <div className="relative" ref={brandRef}>
                <label className="text-xs text-muted-foreground">Бренд</label>
                <Input
                  value={npBrand}
                  onChange={(e) => { setNpBrand(e.target.value); setShowBrandList(true); }}
                  onFocus={() => setShowBrandList(true)}
                  placeholder="Бренд"
                />
                {showBrandList && filteredBrands.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-40 overflow-y-auto shadow-lg">
                    {filteredBrands.map((b) => (
                      <button
                        key={b}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0"
                        onClick={() => { setNpBrand(b); setShowBrandList(false); }}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
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

export default BulkPastePage;
```