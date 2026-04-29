import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const NEW_BARCODES_URL = "https://functions.poehali.dev/753c16bb-172a-460b-a7b4-2ffc3c26b6f7";
const TEMP_PRODUCTS_URL = "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";
const BRANDS_URL = "https://functions.poehali.dev/6406512c-44db-46fe-bc84-7ab460f71dfe";

interface Product {
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

const UnknownBarcodePage = () => {
  const navigate = useNavigate();
  const { barcode: barcodeParam } = useParams<{ barcode: string }>();
  const barcode = barcodeParam ? decodeURIComponent(barcodeParam) : "";
  const { toast } = useToast();
  const token = localStorage.getItem("auth_token") || "";
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
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
  const [articleSuggestions, setArticleSuggestions] = useState<Product[]>([]);
  const [showArticleList, setShowArticleList] = useState(false);
  const articleDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [savingTemp, setSavingTemp] = useState(false);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
    fetch(`${BRANDS_URL}?names_only=1`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setAllBrands(d.items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: query, search_type: "all", per_page: "10" });
        const resp = await fetch(`${PRODUCTS_URL}?${params}`, { headers: authHeaders });
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
  }, [query]);

  const filteredBrands = allBrands.filter((b) => b.toLowerCase().includes(tempBrand.toLowerCase()));

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
        body: JSON.stringify({ barcode, nomenclature_id: productId, save_to_product: true }),
      });
    } catch {
      // ignore
    }
  };

  const finishWith = (product: Product) => {
    sessionStorage.setItem("pending_unknown_product", JSON.stringify(product));
    navigate(-1);
  };

  const handlePick = async (product: Product) => {
    if (!barcode || linking) return;
    setLinking(true);
    await linkBarcode(product.id);
    toast({ title: "Штрихкод привязан", description: product.name });
    finishWith(product);
  };

  const selectArticleFromExisting = async (item: Product) => {
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
        toast({ title: "Товар создан", description: `${tempBrand.trim()} ${tempArticle.trim()}` });
        finishWith({
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
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => navigate(-1)}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm leading-tight">
              Штрихкод <span className="font-mono font-semibold">{barcode}</span> не найден
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              Привяжи к товару или создай новый
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 py-3">
        {!showCreate && (
          <div className="space-y-2">
            <div className="relative">
              <Icon
                name="Search"
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию, артикулу, бренду"
                className="pl-9 h-11 text-base"
                disabled={linking}
              />
              {searching && (
                <Icon
                  name="Loader2"
                  size={16}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                />
              )}
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePick(p)}
                  disabled={linking}
                  className="w-full text-left px-3 py-2.5 border-b border-border hover:bg-accent transition-colors disabled:opacity-50"
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
                className="w-full text-left px-3 py-3 hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-2 text-sm text-primary"
              >
                <Icon name="Plus" size={16} />
                Создать новый товар
              </button>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="space-y-3">
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
                  className="h-11 text-base"
                />
                {showBrandList && filteredBrands.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-border rounded-lg bg-popover overflow-hidden max-h-48 overflow-y-auto shadow-lg">
                    {filteredBrands.slice(0, 20).map((b) => (
                      <button
                        key={b}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b border-border last:border-0"
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
                  className="h-11 text-base"
                />
                {showArticleList && articleSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-border rounded-lg bg-popover overflow-hidden max-h-48 overflow-y-auto shadow-lg">
                    {articleSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b border-border last:border-0"
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
              inputMode="decimal"
              value={tempPrice}
              onChange={(e) => setTempPrice(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 text-base"
            />
            <div className="flex gap-2">
              <Button className="flex-1 h-11" onClick={saveTempProduct} disabled={savingTemp}>
                {savingTemp ? (
                  <Icon name="Loader2" size={16} className="animate-spin mr-1" />
                ) : (
                  <Icon name="Check" size={16} className="mr-1" />
                )}
                Создать
              </Button>
              <Button
                variant="ghost"
                className="h-11"
                onClick={() => setShowCreate(false)}
                disabled={savingTemp}
              >
                Назад
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnknownBarcodePage;
