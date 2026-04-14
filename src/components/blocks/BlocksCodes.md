# Блоки кодов

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
