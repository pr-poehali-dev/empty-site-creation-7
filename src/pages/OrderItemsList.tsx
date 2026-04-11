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
  price_wholesale: number | null;
}

interface OrderLine {
  product_id: number;
  name: string;
  article: string | null;
  quantity: number;
  price: number;
}

const SEARCH_MODES = [
  { value: "all", label: "Все поля" },
  { value: "article", label: "Артикул" },
  { value: "supplier_code", label: "Код поставщика" },
] as const;

const OrderItemsList = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [lines, setLines] = useState<OrderLine[]>([]);
  const [searchMode, setSearchMode] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("draft_order_items");
    let initialLines: OrderLine[] = [];
    if (saved) {
      try { initialLines = JSON.parse(saved); setLines(initialLines); } catch { /* ignore */ }
    }

    const scannedRaw = localStorage.getItem("scanned_order_barcodes");
    if (scannedRaw) {
      try {
        const codes: string[] = JSON.parse(scannedRaw);
        localStorage.removeItem("scanned_order_barcodes");
        if (Array.isArray(codes) && codes.length > 0) {
          (async () => {
            let current = [...initialLines];
            for (const code of codes) {
              if (!code.trim()) continue;
              try {
                const resp = await fetch(`${PRODUCTS_URL}?barcode=${encodeURIComponent(code)}`, { headers: authHeaders });
                const data = await resp.json();
                const found = resp.ok && data.items?.length > 0 ? data.items[0] : data.item || null;
                if (!found) continue;
                const existing = current.find((l) => l.product_id === found.id);
                if (existing) {
                  current = current.map((l) => l.product_id === found.id ? { ...l, quantity: l.quantity + 1 } : l);
                } else {
                  current = [...current, { product_id: found.id, name: found.name, article: found.article, quantity: 1, price: found.price_wholesale || 0 }];
                }
              } catch { /* ignore */ }
            }
            setLines(current);
            localStorage.setItem("draft_order_items", JSON.stringify(current));
          })();
        }
      } catch { /* ignore */ }
    }
  }, []);

  const openScanner = () => {
    localStorage.setItem("scanned_order_barcodes", JSON.stringify([]));
    navigate("/admin/scan?returnTo=/admin/orders/new-list&key=scanned_order_barcodes");
  };

  const saveLines = (next: OrderLine[]) => {
    setLines(next);
    localStorage.setItem("draft_order_items", JSON.stringify(next));
  };

  const searchProducts = useCallback(async (query: string, mode: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: query, search_type: mode, per_page: "10" });
      const resp = await fetch(`${PRODUCTS_URL}?${params}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setSearchResults(data.items || []);
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, [token]);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchProducts(value, searchMode);
    }, 300);
  };

  const addItem = (item: ProductSearchItem) => {
    const existing = lines.find((l) => l.product_id === item.id);
    if (existing) {
      const next = lines.map((l) =>
        l.product_id === item.id ? { ...l, quantity: l.quantity + 1 } : l
      );
      saveLines(next);
      toast({ title: `${item.name} — ещё +1` });
    } else {
      saveLines([
        ...lines,
        {
          product_id: item.id,
          name: item.name,
          article: item.article,
          quantity: 1,
          price: item.price_wholesale || 0,
        },
      ]);
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  const searchByBarcode = async (code: string) => {
    if (!code.trim()) return;
    setSearching(true);
    try {
      const resp = await fetch(`${PRODUCTS_URL}?barcode=${encodeURIComponent(code)}`, {
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok && data.items && data.items.length > 0) {
        addItem(data.items[0]);
        setBarcodeValue("");
      } else if (resp.ok && data.item) {
        addItem(data.item);
        setBarcodeValue("");
      } else {
        toast({ title: "Не найдено", description: "Штрихкод не найден в каталоге", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const updateQty = (index: number, qty: number) => {
    const next = lines.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, qty) } : l));
    saveLines(next);
  };

  const removeLine = (index: number) => {
    saveLines(lines.filter((_, i) => i !== index));
  };

  const totalAmount = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const handleDone = () => {
    localStorage.setItem("draft_order_items", JSON.stringify(lines));
    navigate("/admin/orders");
  };

  const isMobile = typeof window !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleDone}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold">Список позиций</h1>
          </div>
          <Button className="h-9" onClick={handleDone}>
            <Icon name="Check" size={16} />
            <span className="ml-1">Готово</span>
            {lines.length > 0 && <span className="ml-1">({lines.length})</span>}
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        {/* Search mode tabs */}
        <div className="flex gap-1 mb-3 overflow-x-auto">
          {SEARCH_MODES.map((mode) => (
            <button
              key={mode.value}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                searchMode === mode.value
                  ? "bg-primary/20 text-primary"
                  : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
              }`}
              onClick={() => {
                setSearchMode(mode.value);
                if (searchQuery.trim()) searchProducts(searchQuery, mode.value);
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Search + barcode row */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Input
              placeholder={
                searchMode === "article" ? "Введите артикул..."
                : searchMode === "supplier_code" ? "Введите код поставщика..."
                : "Поиск по названию, артикулу, бренду..."
              }
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="h-10 rounded-xl bg-secondary border-white/[0.08] text-sm pr-8"
            />
            {searching && (
              <Icon name="Loader2" size={14} className="absolute right-3 top-3 animate-spin text-muted-foreground" />
            )}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-card overflow-hidden max-h-60 overflow-y-auto shadow-lg">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-sm flex items-center justify-between border-b border-white/[0.04] last:border-0"
                    onClick={() => addItem(item)}
                  >
                    <div className="min-w-0">
                      <span className="block truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.article && `${item.article}`}
                        {item.article && item.brand && " · "}
                        {item.brand || ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                      {item.price_wholesale ? `${item.price_wholesale.toLocaleString()} ₽` : "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${
              showBarcode ? "border-primary bg-primary/20" : "border-white/[0.08] hover:bg-white/[0.06]"
            }`}
            onClick={() => {
              setShowBarcode(!showBarcode);
              if (!showBarcode) setTimeout(() => barcodeInputRef.current?.focus(), 100);
            }}
          >
            <Icon name="ScanBarcode" size={18} />
          </button>
        </div>

        {/* Barcode input */}
        {showBarcode && (
          <div className="flex gap-2 mb-3">
            <Input
              ref={barcodeInputRef}
              placeholder="Введите штрихкод..."
              value={barcodeValue}
              onChange={(e) => setBarcodeValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchByBarcode(barcodeValue);
              }}
              className="h-10 rounded-xl bg-secondary border-white/[0.08] text-sm flex-1"
            />
            {isMobile && (
              <button
                className="w-10 h-10 rounded-xl border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.06] flex-shrink-0"
                onClick={openScanner}
              >
                <Icon name="Camera" size={18} />
              </button>
            )}
          </div>
        )}

        {/* Items list */}
        {lines.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="ListPlus" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Список пуст</p>
            <p className="text-sm text-muted-foreground mt-1">Найдите товар через поиск или штрихкод</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {lines.map((line, i) => (
              <div
                key={line.product_id}
                className="rounded-xl border border-white/[0.08] bg-card p-3 flex items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{line.name}</p>
                  {line.article && <p className="text-xs text-muted-foreground">{line.article}</p>}
                  <p className="text-xs text-muted-foreground">{line.price.toLocaleString()} ₽ × {line.quantity}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    className="w-7 h-7 rounded-md bg-white/[0.06] flex items-center justify-center"
                    onClick={() => updateQty(i, line.quantity - 1)}
                  >
                    <Icon name="Minus" size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{line.quantity}</span>
                  <button
                    className="w-7 h-7 rounded-md bg-white/[0.06] flex items-center justify-center"
                    onClick={() => updateQty(i, line.quantity + 1)}
                  >
                    <Icon name="Plus" size={14} />
                  </button>
                </div>
                <span className="text-sm font-medium w-20 text-right flex-shrink-0">
                  {(line.price * line.quantity).toLocaleString()} ₽
                </span>
                <button
                  className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                  onClick={() => removeLine(i)}
                >
                  <Icon name="X" size={14} className="text-destructive" />
                </button>
              </div>
            ))}
            <div className="flex justify-end pt-3 border-t border-white/[0.08]">
              <p className="text-base font-semibold">Итого: {totalAmount.toLocaleString()} ₽</p>
            </div>
          </div>
        )}
      </main>

    </div>
  );
};

export default OrderItemsList;