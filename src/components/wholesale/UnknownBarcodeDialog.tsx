import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const PRODUCTS_URL =
  "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const NEW_BARCODES_URL =
  "https://functions.poehali.dev/753c16bb-172a-460b-a7b4-2ffc3c26b6f7";
const TEMP_PRODUCTS_URL =
  "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";
const BRANDS_URL =
  "https://functions.poehali.dev/6406512c-44db-46fe-bc84-7ab460f71dfe";

export interface UnknownBarcodeProduct {
  id: number;
  name: string;
  article: string | null;
  brand: string | null;
  supplier_code?: string | null;
  price_base?: number | null;
  price_retail?: number | null;
  price_wholesale?: number | null;
  price_purchase?: number | null;
  product_group?: string | null;
  external_id?: string | null;
  is_temp?: boolean;
  temp_product_id?: number | null;
}

interface Props {
  barcode: string | null;
  token: string;
  onClose: () => void;
  onProductSelected: (product: UnknownBarcodeProduct) => void;
}

export default function UnknownBarcodeDialog({
  barcode,
  token,
  onClose,
  onProductSelected,
}: Props) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnknownBarcodeProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [tempBrand, setTempBrand] = useState("");
  const [tempArticle, setTempArticle] = useState("");
  const [tempPrice, setTempPrice] = useState("");
  const [showBrandList, setShowBrandList] = useState(false);
  const [articleSuggestions, setArticleSuggestions] = useState<UnknownBarcodeProduct[]>([]);
  const [showArticleList, setShowArticleList] = useState(false);
  const articleDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [savingTemp, setSavingTemp] = useState(false);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const open = barcode !== null;

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setShowCreate(false);
      setTempBrand("");
      setTempArticle("");
      setTempPrice("");
      setTimeout(() => inputRef.current?.focus(), 100);
      if (allBrands.length === 0) {
        fetch(`${BRANDS_URL}?names_only=1`, { headers: authHeaders })
          .then((r) => r.json())
          .then((d) => {
            if (Array.isArray(d.items)) setAllBrands(d.items);
          })
          .catch(() => {});
      }
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          search: query,
          search_type: "all",
          per_page: "10",
        });
        const resp = await fetch(`${PRODUCTS_URL}?${params}`, {
          headers: authHeaders,
        });
        const data = await resp.json();
        if (resp.ok) setResults(data.items || []);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, token]);

  const filteredBrands = allBrands.filter((b) =>
    b.toLowerCase().includes(tempBrand.toLowerCase()),
  );

  const searchArticles = (value: string) => {
    setTempArticle(value);
    if (articleDebounceRef.current) clearTimeout(articleDebounceRef.current);
    if (!value.trim() || value.trim().length < 2) {
      setArticleSuggestions([]);
      return;
    }
    articleDebounceRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(
          `${PRODUCTS_URL}?search=${encodeURIComponent(value)}&search_type=article&per_page=8`,
          { headers: authHeaders },
        );
        const data = await resp.json();
        if (resp.ok) setArticleSuggestions(data.items || []);
      } catch {
        // ignore
      }
    }, 300);
  };

  const linkBarcode = async (productId: number) => {
    if (!barcode) return;
    try {
      await fetch(NEW_BARCODES_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          barcode,
          nomenclature_id: productId,
          save_to_product: true,
        }),
      });
    } catch {
      // ignore
    }
  };

  const handlePick = async (product: UnknownBarcodeProduct) => {
    if (!barcode || linking) return;
    setLinking(true);
    await linkBarcode(product.id);
    toast({
      title: "Штрихкод привязан",
      description: product.name,
    });
    onProductSelected(product);
    onClose();
    setLinking(false);
  };

  const selectArticleFromExisting = async (item: UnknownBarcodeProduct) => {
    setShowArticleList(false);
    await handlePick(item);
  };

  const saveTempProduct = async () => {
    if (!barcode) return;
    if (!tempBrand.trim() || !tempArticle.trim() || !tempPrice) {
      toast({ title: "Заполните все поля", variant: "destructive" });
      return;
    }
    setSavingTemp(true);
    try {
      const resp = await fetch(TEMP_PRODUCTS_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          brand: tempBrand.trim(),
          article: tempArticle.trim(),
          price: parseFloat(tempPrice),
          barcode,
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({
          title: "Товар создан",
          description: `${tempBrand.trim()} ${tempArticle.trim()}`,
        });
        onProductSelected({
          id: data.id,
          name: `${tempBrand.trim()} ${tempArticle.trim()}`,
          article: tempArticle.trim(),
          brand: tempBrand.trim(),
          price_base: parseFloat(tempPrice),
          price_retail: parseFloat(tempPrice),
          price_wholesale: parseFloat(tempPrice),
          price_purchase: parseFloat(tempPrice),
          is_temp: true,
          temp_product_id: data.id,
        });
        onClose();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSavingTemp(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!top-[5vh] !translate-y-0 !left-[50%] !translate-x-[-50%] w-[calc(100vw-1rem)] max-w-md p-3 sm:p-4 gap-2 rounded-xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-sm font-normal">
            Штрихкод{" "}
            <span className="text-base font-mono font-semibold">{barcode}</span>{" "}
            не найден
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Привяжи к товару или создай новый
          </p>
        </DialogHeader>

        {!showCreate && (
          <div className="space-y-2">
            <div className="relative">
              <Icon
                name="Search"
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию, артикулу, бренду"
                className="pl-8 h-9 text-sm"
                disabled={linking}
              />
              {searching && (
                <Icon
                  name="Loader2"
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                />
              )}
            </div>

            <div className="max-h-[35vh] overflow-y-auto rounded-lg border border-border">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePick(p)}
                  disabled={linking}
                  className="w-full text-left px-3 py-2 border-b border-border hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[p.brand, p.article].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                disabled={linking}
                className="w-full text-left px-3 py-2 hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-2 text-sm text-primary"
              >
                <Icon name="Plus" size={14} />
                Создать новый товар
              </button>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Input
                  placeholder="Бренд *"
                  value={tempBrand}
                  onChange={(e) => {
                    setTempBrand(e.target.value);
                    setShowBrandList(true);
                  }}
                  onFocus={() => setShowBrandList(true)}
                  onBlur={() => setTimeout(() => setShowBrandList(false), 150)}
                  className="h-9 text-sm"
                />
                {showBrandList && filteredBrands.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-border rounded-lg bg-popover overflow-hidden max-h-40 overflow-y-auto shadow-lg">
                    {filteredBrands.slice(0, 20).map((b) => (
                      <button
                        key={b}
                        type="button"
                        className="w-full text-left px-3 py-1.5 hover:bg-accent text-sm border-b border-border last:border-0"
                        onClick={() => {
                          setTempBrand(b);
                          setShowBrandList(false);
                        }}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Input
                  placeholder="Артикул *"
                  value={tempArticle}
                  onChange={(e) => {
                    searchArticles(e.target.value);
                    setShowArticleList(true);
                  }}
                  onFocus={() => setShowArticleList(true)}
                  onBlur={() => setTimeout(() => setShowArticleList(false), 150)}
                  className="h-9 text-sm"
                />
                {showArticleList && articleSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-border rounded-lg bg-popover overflow-hidden max-h-40 overflow-y-auto shadow-lg">
                    {articleSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full text-left px-3 py-1.5 hover:bg-accent text-sm border-b border-border last:border-0"
                        onClick={() => selectArticleFromExisting(item)}
                      >
                        <span className="block">{item.article}</span>
                        <span className="text-xs text-muted-foreground truncate block">
                          {item.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Input
              placeholder="Цена *"
              type="number"
              value={tempPrice}
              onChange={(e) => setTempPrice(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-9"
                onClick={saveTempProduct}
                disabled={savingTemp}
              >
                {savingTemp ? (
                  <Icon name="Loader2" size={14} className="animate-spin mr-1" />
                ) : (
                  <Icon name="Check" size={14} className="mr-1" />
                )}
                Создать
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => setShowCreate(false)}
                disabled={savingTemp}
              >
                Назад
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
