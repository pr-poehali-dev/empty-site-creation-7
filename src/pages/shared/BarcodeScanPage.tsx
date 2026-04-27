import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";

interface ProductSearchItem {
  id: number;
  name: string;
  article: string | null;
  brand: string | null;
  supplier_code: string | null;
  price_base: number | null;
  price_retail: number | null;
  price_wholesale: number | null;
  price_purchase: number | null;
  product_group: string | null;
  external_id?: string | null;
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
  product_group?: string | null;
  price_base?: number | null;
  price_retail?: number | null;
  price_wholesale?: number | null;
  price_purchase?: number | null;
}

interface ResolveRequest {
  returnTo: string;
  context?: "order" | "return";
  wholesalerId?: number | null;
  authHeaders?: Record<string, string>;
}

const BarcodeScanPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const reqRaw = typeof window !== "undefined" ? sessionStorage.getItem("resolve_request") : null;
  const req: ResolveRequest = reqRaw ? JSON.parse(reqRaw) : { returnTo: "/admin/orders" };
  const token = localStorage.getItem("auth_token") || "";
  const authHeaders = req.authHeaders || {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [barcodeValue, setBarcodeValue] = useState("");
  const [results, setResults] = useState<ProductSearchItem[]>([]);
  const [collected, setCollected] = useState<ResolvedItem[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toResolved = (item: ProductSearchItem, qty = 1): ResolvedItem => ({
    product_id: item.id,
    name: item.name,
    article: item.article,
    brand: item.brand,
    base_price: item.price_wholesale || 0,
    is_temp: false,
    has_uuid: !!item.external_id,
    quantity: qty,
    product_group: item.product_group,
    price_base: item.price_base,
    price_retail: item.price_retail,
    price_wholesale: item.price_wholesale,
    price_purchase: item.price_purchase,
  });

  const addCollected = (item: ProductSearchItem) => {
    setCollected((prev) => {
      const idx = prev.findIndex((p) => p.product_id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [toResolved(item, 1), ...prev];
    });
    setBarcodeValue("");
    setResults([]);
    inputRef.current?.focus();
  };

  const searchExact = async (code: string) => {
    if (!code.trim()) return;
    setSearching(true);
    try {
      const resp = await fetch(`${PRODUCTS_URL}?barcode=${encodeURIComponent(code)}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok && data.items && data.items.length > 0) {
        addCollected(data.items[0]);
      } else if (resp.ok && data.item) {
        addCollected(data.item);
      } else {
        toast({ title: "Не найдено", description: "Штрихкод не найден в каталоге", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const searchPartial = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const resp = await fetch(`${PRODUCTS_URL}?barcode_search=${encodeURIComponent(query)}&per_page=10`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setResults(data.items || []);
    } catch {
      /* ignore */
    }
  }, [token]);

  const handleInput = (value: string) => {
    setBarcodeValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPartial(value), 300);
  };

  const updateQty = (idx: number, qty: number) => {
    setCollected((prev) => prev.map((p, i) => (i === idx ? { ...p, quantity: qty } : p)));
  };

  const removeAt = (idx: number) => {
    setCollected((prev) => prev.filter((_, i) => i !== idx));
  };

  const finish = () => {
    if (collected.length === 0) {
      toast({ title: "Список пуст", variant: "destructive" });
      return;
    }
    sessionStorage.setItem("resolve_result", JSON.stringify({ source: "scan", items: collected }));
    sessionStorage.removeItem("resolve_request");
    navigate(req.returnTo);
  };

  const cancel = () => {
    sessionStorage.removeItem("resolve_request");
    navigate(req.returnTo);
  };

  const total = collected.reduce((sum, l) => sum + l.quantity * l.base_price, 0);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={cancel}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold truncate">Сканер штрихкодов</h1>
          </div>
          <Button size="sm" onClick={finish} disabled={collected.length === 0} className="rounded-xl">
            <Icon name="Check" size={16} />
            <span className="ml-1">Готово ({collected.length})</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Штрихкод</label>
          <div className="relative">
            <Input
              ref={inputRef}
              value={barcodeValue}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  searchExact(barcodeValue);
                }
              }}
              placeholder="Отсканируйте или введите штрихкод"
              className="h-12 rounded-xl bg-secondary border-white/[0.08] text-base"
              autoFocus
            />
            {searching && (
              <Icon name="Loader2" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-auto rounded-xl border border-white/[0.08] bg-card shadow-lg z-10">
                {results.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-white/[0.04] border-b border-white/[0.04] last:border-0"
                    onClick={() => addCollected(p)}
                  >
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.article && (
                      <p className="text-xs text-muted-foreground">{p.brand} · {p.article}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Enter — точный поиск по штрихкоду. Можно вводить часть штрихкода — ниже появятся варианты.
          </p>
        </div>

        {collected.length > 0 ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Отсканировано ({collected.length})</label>
            {collected.map((line, idx) => (
              <div key={idx} className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{line.name}</p>
                    {line.article && (
                      <p className="text-xs text-muted-foreground">{line.brand} · {line.article}</p>
                    )}
                  </div>
                  <button
                    className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                    onClick={() => removeAt(idx)}
                  >
                    <Icon name="X" size={14} className="text-destructive" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Кол-во</label>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateQty(idx, parseInt(e.target.value) || 1)}
                      className="h-9 rounded-lg bg-secondary border-white/[0.08]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Базовая цена</label>
                    <Input
                      type="number"
                      readOnly
                      value={line.base_price}
                      className="h-9 rounded-lg bg-secondary/50 border-white/[0.08]"
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-white/[0.08] bg-card p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Итого позиций / по базовой цене</span>
              <span className="text-lg font-semibold">{collected.length} / {total.toLocaleString()} Br</span>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-12 text-sm">
            Список пуст. Отсканируйте товары — они появятся здесь.
          </div>
        )}
      </main>
    </div>
  );
};

export default BarcodeScanPage;
