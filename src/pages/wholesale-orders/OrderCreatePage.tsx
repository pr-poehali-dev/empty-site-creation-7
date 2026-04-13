import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";

interface OrderLine {
  product_id: number;
  name: string;
  article: string | null;
  quantity: number;
  price: number;
}

interface ProductSearchItem {
  id: number;
  name: string;
  article: string | null;
  brand: string | null;
  supplier_code: string | null;
  price_wholesale: number | null;
}

const SEARCH_MODES = [
  { value: "all", label: "Все поля" },
  { value: "article", label: "Артикул" },
  { value: "supplier_code", label: "Код поставщика" },
] as const;

const OrderCreatePage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editId = id ? parseInt(id) : null;
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [customerName, setCustomerName] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [showExitDialog, setShowExitDialog] = useState(false);

  const [searchMode, setSearchMode] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");

  const DRAFT_KEY = "order_draft_state";

  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.customerName) setCustomerName(d.customerName);
        if (d.comment) setComment(d.comment);
        if (d.lines?.length) setLines(d.lines);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines }));
  }, [customerName, comment, lines]);

  useEffect(() => {
    if (!editId) return;
    const load = async () => {
      try {
        const resp = await fetch(`${ORDERS_URL}?id=${editId}`, { headers: authHeaders });
        const data = await resp.json();
        if (resp.ok && data.order) {
          setCustomerName(data.order.customer_name || "");
          setComment(data.order.comment || "");
          setLines(
            (data.order.items || []).map((item: OrderLine) => ({
              product_id: item.product_id,
              name: item.name,
              article: item.article,
              quantity: item.quantity,
              price: item.price,
            }))
          );
        }
      } catch {
        toast({ title: "Ошибка", description: "Не удалось загрузить заявку", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [editId]);

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
    setLines((prev) => [
      ...prev,
      {
        product_id: item.id,
        name: item.name,
        article: item.article,
        quantity: 1,
        price: item.price_wholesale || 0,
      },
    ]);
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
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: qty } : l)));
  };

  const updatePrice = (index: number, price: number) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, price: Math.max(0, price) } : l)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const totalAmount = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const handleSave = async () => {
    if (!customerName.trim()) {
      toast({ title: "Ошибка", description: "Укажите имя оптовика", variant: "destructive" });
      return;
    }
    if (lines.length === 0) {
      toast({ title: "Ошибка", description: "Добавьте хотя бы одну позицию", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editId ? `${ORDERS_URL}?id=${editId}` : ORDERS_URL;
      const resp = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: authHeaders,
        body: JSON.stringify({
          customer_name: customerName.trim(),
          comment: comment.trim() || null,
          items: lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            price: l.price,
          })),
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        sessionStorage.removeItem(DRAFT_KEY);
        toast({ title: editId ? "Заявка обновлена" : "Заявка создана" });
        navigate("/admin/orders");
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сохранить заявку", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (customerName.trim() || lines.length > 0) {
      setShowExitDialog(true);
    } else {
      navigate("/admin/orders");
    }
  };

  const isMobile = typeof window !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleBack}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold">{editId ? "Редактирование" : "Новая заявка"}</h1>
          </div>
          <Button className="h-9 rounded-xl" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              <Icon name="Check" size={16} />
            )}
            <span className="ml-1">{saving ? "..." : "Сохранить"}</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
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
              <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-60 overflow-y-auto shadow-lg">
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
                onClick={() => {
                  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines }));
                  const returnTo = editId ? `/admin/orders/${editId}/edit` : "/admin/orders/create";
                  navigate(`/admin/scan?returnTo=${returnTo}&key=scanned_order_barcodes`);
                }}
              >
                <Icon name="Camera" size={18} />
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <Input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Оптовик *"
            className="h-9 rounded-xl bg-secondary border-white/[0.08] text-sm flex-1"
          />
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий"
            className="h-9 rounded-xl bg-secondary border-white/[0.08] text-sm flex-1"
          />
        </div>

        {lines.length > 0 && (
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Позиции ({lines.length})</p>
            <p className="text-sm font-semibold">Итого: {totalAmount.toLocaleString()} ₽</p>
          </div>
        )}

        {lines.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="PackageSearch" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Найдите и добавьте товары</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {lines.map((line, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{line.name}</p>
                    {line.article && <p className="text-xs text-muted-foreground">{line.article}</p>}
                  </div>
                  <span className="text-sm font-medium flex-shrink-0 mr-2">
                    {line.price.toLocaleString()} ₽
                  </span>
                  <button
                    className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                    onClick={() => removeLine(i)}
                  >
                    <Icon name="X" size={14} className="text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из заявки?</AlertDialogTitle>
            <AlertDialogDescription>Несохранённые данные будут потеряны</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl border-white/[0.08]">Остаться</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={() => {
                handleSave();
              }}
            >
              Сохранить
            </AlertDialogAction>
            <AlertDialogAction
              className="rounded-xl bg-destructive hover:bg-destructive/90"
              onClick={() => { sessionStorage.removeItem(DRAFT_KEY); navigate("/admin/orders"); }}
            >
              Не сохранять
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrderCreatePage;