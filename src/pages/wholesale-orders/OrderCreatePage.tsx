import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import Icon from "@/components/ui/icon";
import DebugBadge from "@/components/DebugBadge";

const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const WHOLESALERS_URL = "https://functions.poehali.dev/03df983f-e7e9-4cd5-9427-e61b88d1171f";
const PRICING_URL = "https://functions.poehali.dev/8b1df5ee-7914-4801-aa0f-3bd851bdb4a0";
const TEMP_PRODUCTS_URL = "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";
const EXPORT_URL = "https://functions.poehali.dev/9a93a221-e083-4f2d-9e96-1d086b30243b";
const RETURNS_URL = "https://functions.poehali.dev/57193003-9226-4238-83dd-4f87ff8cd5ad";

interface OrderLine {
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

interface TempProduct {
  id: number;
  brand: string;
  article: string;
  quantity: number;
  price: number;
  status: string;
  nomenclature_id: number | null;
}

interface PricingRule {
  id: number;
  priority: number;
  filter_type: string;
  filter_value: string;
  price_field: string;
  formula: string;
  condition_price_field: string | null;
  condition_operator: string | null;
  condition_value: number | null;
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
  const [tempProductResults, setTempProductResults] = useState<TempProduct[]>([]);
  const [productGroups, setProductGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [showGroupList, setShowGroupList] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeResults, setBarcodeResults] = useState<ProductSearchItem[]>([]);
  const barcodeDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [wholesalers, setWholesalers] = useState<{id: number; name: string}[]>([]);
  const [wholesalerId, setWholesalerId] = useState<number | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [showWholesalerList, setShowWholesalerList] = useState(false);
  const wholesalerRef = useRef<HTMLDivElement>(null);
  const [orderStatus, setOrderStatus] = useState("new");
  const [paymentStatus, setPaymentStatus] = useState("not_paid");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [applyingPricing, setApplyingPricing] = useState(false);
  const [copyMode, setCopyMode] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [creatingReturn, setCreatingReturn] = useState(false);

  // Temp product form state
  const [showTempForm, setShowTempForm] = useState(false);
  const [tempBrand, setTempBrand] = useState("");
  const [tempArticle, setTempArticle] = useState("");
  const [tempPrice, setTempPrice] = useState("");
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [showBrandList, setShowBrandList] = useState(false);
  const [articleSuggestions, setArticleSuggestions] = useState<ProductSearchItem[]>([]);
  const [showArticleList, setShowArticleList] = useState(false);
  const brandRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const articleDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [savingTemp, setSavingTemp] = useState(false);
  const canSaveDraftRef = useRef(false);

  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";
  const [lockSettingEnabled, setLockSettingEnabled] = useState(false);
  const isLocked = !!editId && orderStatus !== "new" && lockSettingEnabled && !isOwner;

  const statusLabels: Record<string, { label: string; className: string }> = {
    new: { label: "Новая", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    confirmed: { label: "Подтверждена", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    shipped: { label: "Отгружена", className: "bg-red-500/20 text-red-400 border-red-500/30" },
    completed: { label: "Завершена", className: "bg-green-500/20 text-green-400 border-green-500/30" },
    archived: { label: "Архив", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  };

  const NEXT_STATUS: Record<string, { status: string; label: string; icon: string }> = {
    new: { status: "confirmed", label: "Подтвердить", icon: "CheckCircle" },
    confirmed: { status: "shipped", label: "Отгружена", icon: "Truck" },
  };

  const DRAFT_KEY = editId ? `order_draft_${editId}` : "order_draft_new";

  const loadPricingRules = async (wId: number) => {
    try {
      const resp = await fetch(`${PRICING_URL}?wholesaler_id=${wId}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setPricingRules(data.items || []);
    } catch { setPricingRules([]); }
  };

  const checkCondition = (priceMap: Record<string, number | null>, field: string | null, op: string | null, val: number | null): boolean => {
    if (!field || !op || val == null) return true;
    const price = priceMap[field] || 0;
    if (op === "<") return price < val;
    if (op === ">") return price > val;
    if (op === "=") return price === val;
    if (op === "<=") return price <= val;
    if (op === ">=") return price >= val;
    return true;
  };

  const calcPrice = (item: ProductSearchItem, rules: PricingRule[]): number => {
    const priceMap: Record<string, number | null> = {
      price_base: item.price_base,
      price_retail: item.price_retail,
      price_wholesale: item.price_wholesale,
      price_purchase: item.price_purchase,
    };
    let matchedRule: PricingRule | null = null;
    for (const rule of rules) {
      if (rule.filter_type === "product_group" && item.product_group === rule.filter_value) {
        if (checkCondition(priceMap, rule.condition_price_field, rule.condition_operator, rule.condition_value)) {
          matchedRule = rule;
          break;
        }
      }
    }
    if (matchedRule) {
      let result = priceMap[matchedRule.price_field] || 0;
      const regex = /([+\-*/])\s*([\d.]+)/g;
      let m;
      while ((m = regex.exec(matchedRule.formula)) !== null) {
        const v = parseFloat(m[2]) || 0;
        if (m[1] === "*") result *= v;
        else if (m[1] === "/") result = v ? result / v : 0;
        else if (m[1] === "+") result += v;
        else if (m[1] === "-") result -= v;
      }
      return Math.round(result * 100) / 100;
    }
    return item.price_wholesale || 0;
  };

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    let rulesPromise: Promise<PricingRule[]> | null = null;
    let savedLines: OrderLine[] = [];
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.customerName) setCustomerName(d.customerName);
        if (d.comment) setComment(d.comment);
        if (d.lines?.length) savedLines = d.lines;
        if (d.wholesalerId) {
          setWholesalerId(d.wholesalerId);
          rulesPromise = fetch(`${PRICING_URL}?wholesaler_id=${d.wholesalerId}`, { headers: authHeaders })
            .then(r => r.json())
            .then(data => { const items = data.items || []; setPricingRules(items); return items; })
            .catch(() => [] as PricingRule[]);
        }
      } catch { /* ignore */ }
    }

    const scannedRaw = localStorage.getItem("scanned_order_barcodes");
    if (scannedRaw) {
      localStorage.removeItem("scanned_order_barcodes");
      try {
        const entries: { barcode: string; product_id: number | null; name: string | null; price?: number }[] = JSON.parse(scannedRaw);
        if (entries.length > 0) {
          const loadScanned = async () => {
            const rules = rulesPromise ? await rulesPromise : pricingRules;
            const settled = await Promise.allSettled(
              entries.map(async (entry) => {
                if (entry.product_id) {
                  const resp = await fetch(`${PRODUCTS_URL}?id=${entry.product_id}`, { headers: authHeaders });
                  const data = await resp.json();
                  return { entry, product: data?.item || null };
                }
                return { entry, product: null };
              })
            );
            const newLines: OrderLine[] = [];
            settled.forEach((res, i) => {
              const entry = entries[i];
              if (res.status === "fulfilled" && res.value.product) {
                const product = res.value.product;
                newLines.push({
                  product_id: product.id,
                  name: product.name,
                  article: product.article,
                  quantity: 1,
                  price: (entry.price && entry.price > 0) ? entry.price : calcPrice(product, rules),
                  has_uuid: !!product.external_id,
                });
              } else if (entry.name) {
                newLines.push({
                  product_id: null,
                  name: entry.name,
                  article: null,
                  quantity: 1,
                  price: entry.price || 0,
                  is_temp: true,
                  has_uuid: false,
                });
              } else {
                newLines.push({
                  product_id: null,
                  name: `Штрихкод ${entry.barcode}`,
                  article: entry.barcode,
                  quantity: 1,
                  price: entry.price || 0,
                  is_temp: true,
                  has_uuid: false,
                });
              }
            });
            setLines([...newLines, ...savedLines]);
            if (newLines.length < entries.length) {
              toast({ title: `Добавлено ${newLines.length} из ${entries.length}`, variant: "destructive" });
            }
            if (!editId) canSaveDraftRef.current = true;
          };
          loadScanned();
          return;
        }
      } catch { /* ignore */ }
    }

    const resolveRaw = sessionStorage.getItem("resolve_result");
    if (resolveRaw) {
      sessionStorage.removeItem("resolve_result");
      try {
        const parsed = JSON.parse(resolveRaw) as {
          source: "scan" | "bulk";
          items: Array<{
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
            product_group?: string | null;
            price_base?: number | null;
            price_retail?: number | null;
            price_wholesale?: number | null;
            price_purchase?: number | null;
          }>;
        };
        if (parsed.items?.length) {
          const applyResolve = async () => {
            const rules = rulesPromise ? await rulesPromise : pricingRules;
            const newLines: OrderLine[] = parsed.items.map((it) => {
              let price = it.base_price;
              if (parsed.source === "scan" && !it.is_temp && it.product_group !== undefined) {
                const pseudoItem = {
                  id: it.product_id || 0,
                  name: it.name,
                  article: it.article,
                  brand: it.brand || null,
                  supplier_code: null,
                  price_base: it.price_base ?? null,
                  price_retail: it.price_retail ?? null,
                  price_wholesale: it.price_wholesale ?? null,
                  price_purchase: it.price_purchase ?? null,
                  product_group: it.product_group ?? null,
                  external_id: it.has_uuid ? "x" : null,
                } as ProductSearchItem;
                const calc = calcPrice(pseudoItem, rules);
                if (calc > 0) price = calc;
              }
              return {
                product_id: it.product_id,
                temp_product_id: it.temp_product_id ?? null,
                name: it.name,
                article: it.article,
                brand: it.brand,
                quantity: it.quantity,
                price,
                is_temp: it.is_temp,
                has_uuid: it.has_uuid,
                from_bulk: it.from_bulk,
              };
            });
            const ordered = parsed.source === "bulk" ? [...newLines].reverse() : newLines;
            setLines([...ordered, ...savedLines]);
            toast({ title: `Добавлено: ${newLines.length}` });
            if (!editId) canSaveDraftRef.current = true;
          };
          applyResolve();
          return;
        }
      } catch { /* ignore */ }
    }

    if (!editId && savedLines.length > 0) setLines(savedLines);
    if (!editId) canSaveDraftRef.current = true;
  }, []);

  useEffect(() => {
    if (!canSaveDraftRef.current) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines, wholesalerId }));
    }, 500);
    return () => clearTimeout(timer);
  }, [customerName, comment, lines, wholesalerId]);


  useEffect(() => {
    const loadAppSettings = async () => {
      try {
        const resp = await fetch("https://functions.poehali.dev/82a95791-7a9f-4f40-8167-eb96c3045d34", { headers: authHeaders });
        if (resp.ok) {
          const data = await resp.json();
          setLockSettingEnabled(data.lock_non_new_orders === "true");
        }
      } catch { /* ignore */ }
    };
    loadAppSettings();
  }, []);

  useEffect(() => {
    if (!editId) return;
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        if (d.customerName) setCustomerName(d.customerName);
        if (d.comment) setComment(d.comment);
        if (d.lines?.length) setLines(d.lines);
        if (d.wholesalerId) {
          setWholesalerId(d.wholesalerId);
          loadPricingRules(d.wholesalerId);
        }
      } catch { /* ignore */ }
      canSaveDraftRef.current = true;
      setLoading(false);

      const loadStatus = async () => {
        try {
          const resp = await fetch(`${ORDERS_URL}?id=${editId}`, { headers: authHeaders });
          const data = await resp.json();
          if (resp.ok && data.order) {
            setOrderStatus(data.order.status || "new");
            setPaymentStatus(data.order.payment_status || "not_paid");
          }
        } catch { /* ignore */ }
      };
      loadStatus();
      return;
    }

    const load = async () => {
      try {
        const resp = await fetch(`${ORDERS_URL}?id=${editId}`, { headers: authHeaders });
        const data = await resp.json();
        if (resp.ok && data.order) {
          setCustomerName(data.order.customer_name || "");
          setComment(data.order.comment || "");
          setOrderStatus(data.order.status || "new");
          setPaymentStatus(data.order.payment_status || "not_paid");
          setLines(
            (data.order.items || []).map((item: OrderLine) => ({
              product_id: item.product_id,
              name: item.name,
              article: item.article,
              quantity: item.quantity,
              price: item.price,
              is_temp: item.is_temp,
              temp_product_id: item.temp_product_id,
              has_uuid: item.has_uuid,
              from_bulk: item.from_bulk,
            }))
          );
          const wResp = await fetch(WHOLESALERS_URL, { headers: authHeaders });
          const wData = await wResp.json();
          const found = (wData.items || []).find((w: {id: number; name: string}) => w.name === data.order.customer_name);
          if (found) {
            setWholesalerId(found.id);
            loadPricingRules(found.id);
          }
        }
      } catch {
        toast({ title: "Ошибка", description: "Не удалось загрузить заявку", variant: "destructive" });
      } finally {
        setLoading(false);
        canSaveDraftRef.current = true;
      }
    };
    load();
  }, [editId]);

  const searchProducts = useCallback(async (query: string, mode: string, group?: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setTempProductResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: query, search_type: mode, per_page: "10" });
      const g = group !== undefined ? group : selectedGroup;
      if (g) params.set("filter_group", g);
      const [prodResp, tempResp] = await Promise.all([
        fetch(`${PRODUCTS_URL}?${params}`, { headers: authHeaders }),
        fetch(`${TEMP_PRODUCTS_URL}?search=${encodeURIComponent(query)}&per_page=5`, { headers: authHeaders }),
      ]);
      const prodData = await prodResp.json();
      const tempData = await tempResp.json();
      if (prodResp.ok) setSearchResults(prodData.items || []);
      if (tempResp.ok) setTempProductResults(tempData.items || []);
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, [token, selectedGroup]);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchProducts(value, searchMode);
    }, 300);
  };

  const pendingHandledRef = useRef(false);
  useEffect(() => {
    if (pendingHandledRef.current) return;
    if (loading) return;
    const raw = sessionStorage.getItem("pending_unknown_product");
    if (!raw) return;
    try {
      const product = JSON.parse(raw) as ProductSearchItem & { is_temp?: boolean; temp_product_id?: number | null };
      sessionStorage.removeItem("pending_unknown_product");
      pendingHandledRef.current = true;
      if (product.is_temp && product.temp_product_id) {
        setLines((prev) => [
          {
            product_id: null,
            temp_product_id: product.temp_product_id ?? null,
            name: product.name,
            article: product.article,
            brand: product.brand,
            quantity: 1,
            price: product.price_base || 0,
            is_temp: true,
            has_uuid: false,
          },
          ...prev,
        ]);
      } else {
        setLines((prev) => [
          {
            product_id: product.id,
            name: product.name,
            article: product.article,
            brand: product.brand,
            quantity: 1,
            price: calcPrice(product, pricingRules),
            is_temp: false,
            has_uuid: !!product.external_id,
          },
          ...prev,
        ]);
      }
    } catch {
      sessionStorage.removeItem("pending_unknown_product");
    }
  }, [loading, pricingRules]);

  const addItem = (item: ProductSearchItem) => {
    setLines((prev) => [
      {
        product_id: item.id,
        name: item.name,
        article: item.article,
        brand: item.brand,
        quantity: 1,
        price: calcPrice(item, pricingRules),
        is_temp: false,
        has_uuid: !!item.external_id,
      },
      ...prev,
    ]);
    setSearchQuery("");
    setSearchResults([]);
    setTempProductResults([]);
  };

  const addTempItemFromExisting = (tp: TempProduct) => {
    setLines((prev) => [
      {
        product_id: null,
        temp_product_id: tp.id,
        name: `${tp.brand} ${tp.article}`,
        article: tp.article,
        brand: tp.brand,
        quantity: tp.quantity,
        price: tp.price,
        is_temp: true,
        has_uuid: false,
      },
      ...prev,
    ]);
    setSearchQuery("");
    setSearchResults([]);
    setTempProductResults([]);
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
        setBarcodeValue("");
        navigate(`/admin/orders/unknown-barcode/${encodeURIComponent(code)}`);
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleHardwareScan = useCallback(async (code: string) => {
    if (!code.trim()) return;
    try {
      const resp = await fetch(`${PRODUCTS_URL}?barcode=${encodeURIComponent(code)}`, {
        headers: authHeaders,
      });
      const data = await resp.json();
      const product: ProductSearchItem | null =
        (resp.ok && Array.isArray(data.items) && data.items.length > 0)
          ? data.items[0]
          : (resp.ok && data.item) ? data.item : null;
      if (product) {
        addItem(product);
        toast({ title: "Добавлено", description: product.name });
      } else {
        navigate(`/admin/orders/unknown-barcode/${encodeURIComponent(code)}`);
      }
    } catch {
      toast({ title: "Ошибка сканирования", variant: "destructive" });
    }
  }, [token, pricingRules]);

  const { isActive: scannerActive } = useBarcodeScanner({
    enabled: !loading && !isLocked,
    onScan: handleHardwareScan,
  });

  const searchBarcodePartial = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setBarcodeResults([]);
      return;
    }
    try {
      const resp = await fetch(`${PRODUCTS_URL}?barcode_search=${encodeURIComponent(query)}&per_page=10`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setBarcodeResults(data.items || []);
    } catch { /* ignore */ }
  }, [token]);

  const handleBarcodeInput = (value: string) => {
    setBarcodeValue(value);
    if (barcodeDebounceRef.current) clearTimeout(barcodeDebounceRef.current);
    barcodeDebounceRef.current = setTimeout(() => searchBarcodePartial(value), 300);
  };

  const addItemFromBarcode = (item: ProductSearchItem) => {
    addItem(item);
    setBarcodeValue("");
    setBarcodeResults([]);
  };

  // Load brands for temp product form
  const loadBrands = useCallback(async () => {
    try {
      const resp = await fetch(`https://functions.poehali.dev/6406512c-44db-46fe-bc84-7ab460f71dfe?names_only=1`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.items)) {
        setAllBrands(data.items);
      }
    } catch { /* ignore */ }
  }, [token]);

  const searchArticles = (value: string) => {
    setTempArticle(value);
    if (articleDebounceRef.current) clearTimeout(articleDebounceRef.current);
    if (!value.trim() || value.trim().length < 2) { setArticleSuggestions([]); return; }
    articleDebounceRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`${PRODUCTS_URL}?search=${encodeURIComponent(value)}&search_type=article&per_page=8`, { headers: authHeaders });
        const data = await resp.json();
        if (resp.ok) setArticleSuggestions(data.items || []);
      } catch { /* ignore */ }
    }, 300);
  };

  const selectArticleFromExisting = (item: ProductSearchItem) => {
    setShowTempForm(false);
    setTempBrand("");
    setTempArticle("");
    setTempQty("1");
    setTempPrice("");
    setArticleSuggestions([]);
    addItem(item);
  };

  const saveTempProduct = async () => {
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
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        // Add new brand to list if not exists
        if (!allBrands.includes(tempBrand.trim())) {
          setAllBrands(prev => [...prev, tempBrand.trim()].sort());
        }
        setLines(prev => [
          {
            product_id: null,
            temp_product_id: data.id,
            name: `${tempBrand.trim()} ${tempArticle.trim()}`,
            article: tempArticle.trim(),
            brand: tempBrand.trim(),
            quantity: 1,
            price: parseFloat(tempPrice),
            is_temp: true,
            has_uuid: false,
          },
          ...prev,
        ]);
        setShowTempForm(false);
        setTempBrand("");
        setTempArticle("");
        setTempPrice("");
        setSearchQuery("");
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSavingTemp(false);
    }
  };

  useEffect(() => {
    const loadWholesalers = async () => {
      try {
        const resp = await fetch(WHOLESALERS_URL, { headers: authHeaders });
        const data = await resp.json();
        if (resp.ok) setWholesalers(data.items || []);
      } catch { /* ignore */ }
    };
    const loadGroups = async () => {
      try {
        const resp = await fetch(`${PRODUCTS_URL}?distinct=product_group`, { headers: authHeaders });
        const data = await resp.json();
        if (resp.ok) setProductGroups(data.groups || []);
      } catch { /* ignore */ }
    };
    loadWholesalers();
    loadGroups();
    loadBrands();
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wholesalerRef.current && !wholesalerRef.current.contains(e.target as Node)) {
        setShowWholesalerList(false);
      }
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setShowGroupList(false);
      }
      if (brandRef.current && !brandRef.current.contains(e.target as Node)) {
        setShowBrandList(false);
      }
      if (articleRef.current && !articleRef.current.contains(e.target as Node)) {
        setShowArticleList(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredWholesalers = wholesalers.filter(w =>
    w.name.toLowerCase().includes(customerName.toLowerCase())
  );

  const selectWholesaler = (w: {id: number; name: string}) => {
    setCustomerName(w.name);
    setWholesalerId(w.id);
    setShowWholesalerList(false);
    loadPricingRules(w.id);
  };

  useEffect(() => {
    if (!customerName.trim() || wholesalers.length === 0) return;
    const found = wholesalers.find(w => w.name === customerName.trim());
    if (found && found.id !== wholesalerId) {
      setWholesalerId(found.id);
      loadPricingRules(found.id);
    }
  }, [customerName, wholesalers]);

  const updateQty = (index: number, qty: number) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, qty) } : l)));
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
            name: l.name,
            quantity: l.quantity,
            price: l.price,
            is_temp: l.is_temp || false,
            temp_product_id: l.temp_product_id || null,
            has_uuid: l.has_uuid || false,
            from_bulk: l.from_bulk || false,
          })),
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        localStorage.removeItem(DRAFT_KEY);
        toast({ title: editId ? "Заявка обновлена" : "Заявка создана" });
        if (!editId && data.id) {
          navigate(`/admin/orders/${data.id}/edit`, { replace: true });
        }
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

  const enterCopyMode = () => {
    setSelectedIdx(new Set());
    setCopyMode(true);
  };

  const exitCopyMode = () => {
    setCopyMode(false);
    setSelectedIdx(new Set());
  };

  const toggleLineSelected = (i: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleAllSelected = () => {
    if (selectedIdx.size === lines.length) {
      setSelectedIdx(new Set());
    } else {
      setSelectedIdx(new Set(lines.map((_, i) => i)));
    }
  };

  const copyToReturn = async () => {
    if (selectedIdx.size === 0) {
      toast({ title: "Выберите товары", description: "Отметьте позиции для переноса в возврат", variant: "destructive" });
      return;
    }
    if (!customerName.trim()) {
      toast({ title: "Ошибка", description: "У заявки не указан оптовик", variant: "destructive" });
      return;
    }
    const items = lines
      .filter((_, i) => selectedIdx.has(i))
      .map((l) => ({
        product_id: l.product_id,
        temp_product_id: l.temp_product_id || null,
        name: l.name,
        quantity: l.quantity,
        price: l.price,
        from_bulk: !!l.from_bulk,
      }));

    setCreatingReturn(true);
    try {
      const resp = await fetch(RETURNS_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          customer_name: customerName.trim(),
          comment: comment.trim() || null,
          items,
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: `Возврат #${data.id} создан` });
        navigate(`/admin/returns/${data.id}/edit`);
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось создать возврат", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось создать возврат", variant: "destructive" });
    } finally {
      setCreatingReturn(false);
    }
  };

  const updateOrderStatus = async (newStatus: string) => {
    if (!editId) return;
    setStatusUpdating(true);
    try {
      const resp = await fetch(`${ORDERS_URL}?id=${editId}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ status: newStatus }),
      });
      if (resp.ok) {
        toast({ title: "Статус обновлён" });
        navigate("/admin/orders");
      } else {
        const data = await resp.json();
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось обновить статус", variant: "destructive" });
    } finally {
      setStatusUpdating(false);
    }
  };

  const archiveOrder = async () => {
    if (!editId) return;
    try {
      const resp = await fetch(`${ORDERS_URL}?id=${editId}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ status: "archived" }),
      });
      if (resp.ok) {
        toast({ title: "Заявка удалена" });
        navigate("/admin/orders");
      } else {
        const data = await resp.json();
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" });
    }
  };

  const filteredBrands = allBrands.filter(b =>
    b.toLowerCase().includes(tempBrand.toLowerCase())
  );

  const exportToExcel = async () => {
    if (!editId) return;
    setExporting(true);
    try {
      const resp = await fetch(`${EXPORT_URL}?id=${editId}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok && data.file) {
        const byteChars = atob(data.file);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename || `Заявка_${editId}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось экспортировать", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось скачать файл", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const canApplyPricing = isOwner || user.role_name === "Управляющий";

  const applyPricing = async () => {
    if (pricingRules.length === 0) {
      toast({ title: "Нет правил ценообразования", description: "Выберите оптовика с настроенными правилами", variant: "destructive" });
      return;
    }
    setApplyingPricing(true);
    try {
      const ids = Array.from(
        new Set(
          lines
            .filter((l) => !l.is_temp && l.product_id)
            .map((l) => l.product_id as number)
        )
      );
      const productMap = new Map<number, ProductSearchItem>();
      if (ids.length > 0) {
        const settled = await Promise.allSettled(
          ids.map(async (pid) => {
            const r = await fetch(`${PRODUCTS_URL}?id=${pid}`, { headers: authHeaders });
            const d = await r.json();
            return { pid, product: r.ok ? (d?.item || null) : null };
          })
        );
        settled.forEach((res) => {
          if (res.status === "fulfilled" && res.value.product) {
            productMap.set(res.value.pid, res.value.product);
          }
        });
      }
      let updated = 0;
      const newLines = lines.map((l) => {
        if (l.is_temp || !l.product_id) return l;
        const product = productMap.get(l.product_id);
        if (!product) return l;
        const newPrice = calcPrice(product, pricingRules);
        if (newPrice !== l.price) updated += 1;
        return { ...l, price: newPrice };
      });
      setLines(newLines);
      toast({ title: "Цены пересчитаны", description: `Обновлено позиций: ${updated}` });
    } catch {
      toast({ title: "Ошибка", description: "Не удалось пересчитать цены", variant: "destructive" });
    } finally {
      setApplyingPricing(false);
    }
  };

  const isMobile = typeof window !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);

  const showDropdown = searchQuery.trim().length >= 2 && !showTempForm;
  const hasResults = searchResults.length > 0 || tempProductResults.length > 0;

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
            <h1 className="text-lg font-semibold">{editId ? `Заявка #${editId}` : "Новая заявка"}</h1>
            {editId && (
              <Badge className={`${(statusLabels[orderStatus] || statusLabels.new).className} text-xs`}>
                {(statusLabels[orderStatus] || statusLabels.new).label}
              </Badge>
            )}
            {scannerActive && (
              <span
                title="Сканер штрихкодов активен"
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/15 text-green-400 border border-green-500/30 text-[10px] font-medium"
              >
                <Icon name="ScanLine" size={12} />
                Сканер
              </span>
            )}
          </div>
          <Button
            size="sm"
            className="h-9 rounded-lg px-3 sm:px-4"
            onClick={handleSave}
            disabled={saving}
            title="Сохранить заявку"
          >
            {saving ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              <Icon name="Check" size={16} />
            )}
            <span className="ml-2 hidden sm:inline">
              {saving ? "Сохранение..." : "Сохранить"}
            </span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        {isLocked && (
          <div className="mb-3 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 flex items-start gap-2">
            <Icon name="Lock" size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-200">
              Заявка в статусе «{(statusLabels[orderStatus] || statusLabels.new).label}». Редактирование товаров недоступно. Комментарий можно менять.
            </p>
          </div>
        )}
        <div className="flex gap-1 mb-3 items-start">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide flex-1" style={{scrollbarWidth: 'none'}}>
            {SEARCH_MODES.map((mode) => (
              <button
                key={mode.value}
                disabled={isLocked}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
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
          <div className="relative flex-shrink-0" ref={groupRef}>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                selectedGroup
                  ? "bg-primary/20 text-primary"
                  : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
              }`}
              onClick={() => setShowGroupList(!showGroupList)}
            >
              {selectedGroup ? `${selectedGroup}` : "Группа"}
              <Icon name={showGroupList ? "ChevronUp" : "ChevronDown"} size={12} />
            </button>
            {showGroupList && (
              <div className="absolute top-full right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-60 overflow-y-auto shadow-lg min-w-[200px]">
                {selectedGroup && (
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm text-primary border-b border-white/[0.04]"
                    onClick={() => { setSelectedGroup(""); setShowGroupList(false); if (searchQuery.trim()) searchProducts(searchQuery, searchMode, ""); }}
                  >
                    Все группы
                  </button>
                )}
                {productGroups.map((g) => (
                  <button
                    key={g}
                    className={`w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0 ${selectedGroup === g ? "bg-white/[0.06] text-primary" : ""}`}
                    onClick={() => { setSelectedGroup(g); setShowGroupList(false); if (searchQuery.trim()) searchProducts(searchQuery, searchMode, g); }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <DebugBadge id="OrderCreate:search">
              <Input
                placeholder={
                  searchMode === "article" ? "Введите артикул..."
                  : searchMode === "supplier_code" ? "Введите код поставщика..."
                  : "Поиск по названию, артикулу, бренду..."
                }
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                disabled={isLocked}
                className="h-10 rounded-xl bg-secondary border-white/[0.08] text-sm pr-8"
              />
            </DebugBadge>

            {searching && (
              <Icon name="Loader2" size={14} className="absolute right-3 top-3 animate-spin text-muted-foreground" />
            )}
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-72 overflow-y-auto shadow-lg">
                {tempProductResults.map((tp) => (
                  <button
                    key={`tp-${tp.id}`}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-sm flex items-center justify-between border-b border-white/[0.04]"
                    onClick={() => addTempItemFromExisting(tp)}
                  >
                    <div className="min-w-0">
                      <span className="block truncate">{tp.brand} {tp.article}</span>
                      <span className="text-xs text-amber-400 flex items-center gap-1">
                        <Icon name="AlertTriangle" size={10} /> временный товар
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                      {tp.price ? `${tp.price.toLocaleString()} Br` : "—"}
                    </span>
                  </button>
                ))}
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-sm flex items-center justify-between border-b border-white/[0.04] last:border-0"
                    onClick={() => addItem(item)}
                  >
                    <div className="min-w-0">
                      <span className="block break-words">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.article && `${item.article}`}
                        {item.article && item.brand && " · "}
                        {item.brand || ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                      {item.price_wholesale ? `${item.price_wholesale.toLocaleString()} Br` : "—"}
                    </span>
                  </button>
                ))}
                {!hasResults && !searching && (
                  <button
                    className="w-full text-left px-3 py-3 hover:bg-white/[0.06] transition-colors text-sm text-amber-400 flex items-center gap-2 border-b border-white/[0.04]"
                    onClick={() => setShowTempForm(true)}
                  >
                    <Icon name="PlusCircle" size={14} />
                    Товара нет в каталоге — добавь артикул и бренд
                  </button>
                )}
                {hasResults && (
                  <button
                    className="w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-xs text-amber-400 flex items-center gap-2"
                    onClick={() => setShowTempForm(true)}
                  >
                    <Icon name="PlusCircle" size={12} />
                    Товара нет в каталоге — добавь артикул и бренд
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            disabled={isLocked}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              showBarcode ? "border-primary bg-primary/20" : "border-white/[0.08] hover:bg-white/[0.06]"
            }`}
            onClick={() => {
              setShowBarcode(!showBarcode);
              if (!showBarcode) setTimeout(() => barcodeInputRef.current?.focus(), 100);
            }}
            title="Сканер штрихкодов"
          >
            <Icon name="ScanBarcode" size={18} />
          </button>
          {isOwner && (
            <button
              disabled={isLocked}
              className="w-10 h-10 rounded-xl border border-white/[0.08] hover:bg-white/[0.06] flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines, wholesalerId }));
                navigate(editId ? `/admin/orders/${editId}/bulk-paste` : "/admin/orders/create/bulk-paste");
              }}
              title="Вставить списком (пакетный ввод)"
            >
              <Icon name="ClipboardPaste" size={18} />
            </button>
          )}
        </div>

        {/* Temp product form */}
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
                      <button
                        key={b}
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0"
                        onClick={() => { setTempBrand(b); setShowBrandList(false); }}
                      >
                        {b}
                      </button>
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
                      <button
                        key={item.id}
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0"
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
            <div className="mb-2">
              <Input
                placeholder="Цена *"
                type="number"
                value={tempPrice}
                onChange={(e) => setTempPrice(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 rounded-lg bg-secondary border-white/[0.08] text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-lg flex-1" onClick={saveTempProduct} disabled={savingTemp}>
                {savingTemp ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
                <span className="ml-1">Добавить</span>
              </Button>
              <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => { setShowTempForm(false); setTempBrand(""); setTempArticle(""); setTempPrice(""); }}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {showBarcode && (
          <div className="relative flex gap-2 mb-3">
            <div className="relative flex-1">
              <Input
                ref={barcodeInputRef}
                placeholder="Введите штрихкод..."
                value={barcodeValue}
                onChange={(e) => handleBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { searchByBarcode(barcodeValue); setBarcodeResults([]); }
                }}
                className="h-10 rounded-xl bg-secondary border-white/[0.08] text-sm"
              />
              {barcodeResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-60 overflow-y-auto shadow-lg">
                  {barcodeResults.map((item) => (
                    <button
                      key={item.id}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-sm flex items-center justify-between border-b border-white/[0.04] last:border-0"
                      onClick={() => addItemFromBarcode(item)}
                    >
                      <div className="min-w-0">
                        <span className="block break-words">{item.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.article && `${item.article}`}
                          {item.article && item.brand && " · "}
                          {item.brand || ""}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {item.price_wholesale ? `${item.price_wholesale.toLocaleString()} Br` : "—"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isMobile && (
              <button
                className="w-10 h-10 rounded-xl border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.06] flex-shrink-0"
                onClick={() => {
                  localStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines, wholesalerId }));
                  const returnTo = editId ? `/admin/orders/${editId}/edit` : "/admin/orders/create";
                  const wParam = wholesalerId ? `&wholesalerId=${wholesalerId}` : "";
                  navigate(`/admin/scan?returnTo=${returnTo}&key=scanned_order_barcodes${wParam}`);
                }}
              >
                <Icon name="Camera" size={18} />
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <DebugBadge id="OrderCreate:wholesalerId" className="relative flex-1">
            <div className="relative" ref={wholesalerRef}>
              <Input
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setShowWholesalerList(true); }}
                onFocus={() => setShowWholesalerList(true)}
                placeholder="Оптовик *"
                disabled={isLocked}
                className="h-9 rounded-xl bg-secondary border-white/[0.08] text-sm"
              />
            {showWholesalerList && (customerName === "" || filteredWholesalers.length > 0) && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-40 overflow-y-auto shadow-lg">
                {filteredWholesalers.map((w) => (
                  <button
                    key={w.id}
                    className="w-full text-left px-3 py-2 hover:bg-white/[0.06] transition-colors text-sm border-b border-white/[0.04] last:border-0"
                    onClick={() => selectWholesaler(w)}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}
            </div>
          </DebugBadge>
          <DebugBadge id="OrderCreate:comment" className="flex-1">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий"
              className="h-9 rounded-xl bg-secondary border-white/[0.08] text-sm"
            />
          </DebugBadge>
        </div>

        {lines.length > 0 && (
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {copyMode && (
                <input
                  type="checkbox"
                  checked={selectedIdx.size === lines.length && lines.length > 0}
                  onChange={toggleAllSelected}
                  className="w-4 h-4 rounded border-white/20 bg-white/[0.04] flex-shrink-0 cursor-pointer"
                />
              )}
              <p className="text-sm text-muted-foreground">
                {copyMode
                  ? `Выбрано: ${selectedIdx.size} из ${lines.length}`
                  : `Позиции (${lines.length})`}
              </p>
            </div>
            <p className="text-sm font-semibold">Итого: {totalAmount.toLocaleString()} Br</p>
          </div>
        )}

        {lines.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="PackageSearch" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Найдите и добавьте товары</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {lines.map((line, i) => {
              const isBlueLine = line.from_bulk === true && line.is_temp !== true;
              const isRedLine = !isBlueLine && (line.is_temp === true || (line.product_id && line.has_uuid === false));
              const zeroPrice = !line.price || line.price === 0;
              return (
                <DebugBadge id={`OrderCreate:line[${i}]`} key={i}>
                  <div
                    className={`rounded-lg p-2.5 ${
                      isRedLine
                        ? "bg-red-950/20"
                        : isBlueLine
                        ? "bg-blue-950/20"
                        : "bg-white/[0.02]"
                    } ${
                      zeroPrice
                        ? "border-2 border-red-500"
                        : isRedLine
                        ? "border border-red-500/30"
                        : isBlueLine
                        ? "border border-blue-500/30"
                        : "border border-white/[0.08]"
                    }`}
                  >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        {copyMode && (
                          <input
                            type="checkbox"
                            checked={selectedIdx.has(i)}
                            onChange={() => toggleLineSelected(i)}
                            className="w-4 h-4 rounded border-white/20 bg-white/[0.04] flex-shrink-0 mt-0.5 cursor-pointer"
                          />
                        )}
                        <p className="text-sm break-words min-w-0"><span className="text-muted-foreground">{lines.length - i}.</span> {line.name}</p>
                        {isRedLine && (
                          <span className="text-xs text-red-400 flex-shrink-0 mt-0.5">новый</span>
                        )}
                      </div>
                      {line.article && <p className="text-xs text-muted-foreground">{line.article}</p>}
                    </div>
                    {!isLocked && (
                      <button
                        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                        onClick={() => removeLine(i)}
                      >
                        <Icon name="X" size={14} className="text-destructive" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        disabled={isLocked}
                        className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => updateQty(i, line.quantity - 1)}
                      >
                        <Icon name="Minus" size={10} />
                      </button>
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateQty(i, parseFloat(e.target.value) || 1)}
                        onFocus={(e) => e.currentTarget.select()}
                        disabled={isLocked}
                        className="w-12 h-6 text-center text-xs p-0 bg-white/[0.04] border-white/[0.08] rounded"
                      />
                      <button
                        disabled={isLocked}
                        className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => updateQty(i, line.quantity + 1)}
                      >
                        <Icon name="Plus" size={10} />
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">шт</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <Input
                        type="number"
                        value={line.price}
                        onChange={(e) => updatePrice(i, parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.currentTarget.select()}
                        disabled={isLocked}
                        className="w-20 h-6 text-right text-xs p-1 bg-white/[0.04] border-white/[0.08] rounded"
                      />
                      <span className="text-xs text-muted-foreground">Br</span>
                    </div>
                    <span className="text-xs font-medium flex-shrink-0">
                      = {(line.price * line.quantity).toLocaleString()} Br
                    </span>
                  </div>
                  </div>
                </DebugBadge>
              );
            })}
          </div>
        )}

        <div className="mt-4">
          {copyMode ? (
            <div className="flex gap-2">
              <DebugBadge id="OrderCreate:copyToReturnBtn" className="flex-1">
                <Button
                  className="w-full h-11 rounded-xl"
                  onClick={copyToReturn}
                  disabled={creatingReturn || selectedIdx.size === 0}
                >
                  {creatingReturn ? (
                    <Icon name="Loader2" size={16} className="animate-spin" />
                  ) : (
                    <Icon name="Undo2" size={16} />
                  )}
                  <span className="ml-2">
                    {creatingReturn
                      ? "Создание..."
                      : `Копировать в возврат${selectedIdx.size > 0 ? ` (${selectedIdx.size})` : ""}`}
                  </span>
                </Button>
              </DebugBadge>
              <Button
                variant="outline"
                className="h-11 rounded-xl border-white/[0.08]"
                onClick={exitCopyMode}
                disabled={creatingReturn}
              >
                <Icon name="X" size={16} />
                <span className="ml-2">Отмена</span>
              </Button>
            </div>
          ) : (
            <DebugBadge id="OrderCreate:saveBtn">
              <Button className="w-full h-11 rounded-xl" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Icon name="Loader2" size={16} className="animate-spin" />
                ) : (
                  <Icon name="Check" size={16} />
                )}
                <span className="ml-2">{saving ? "Сохранение..." : "Сохранить"}</span>
              </Button>
            </DebugBadge>
          )}
        </div>

        {editId && !copyMode && (
          <div className="mt-4">
            <DebugBadge id="OrderCreate:createReturnBtn">
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl border-white/[0.08]"
                onClick={enterCopyMode}
              >
                <Icon name="Undo2" size={16} />
                <span className="ml-2">Создать возврат</span>
              </Button>
            </DebugBadge>
          </div>
        )}

        {editId && !copyMode && orderStatus !== "archived" && orderStatus !== "completed" && (
          <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {NEXT_STATUS[orderStatus] && (
                <Button
                  className="rounded-xl flex-1"
                  disabled={statusUpdating}
                  onClick={() => updateOrderStatus(NEXT_STATUS[orderStatus].status)}
                >
                  {statusUpdating ? (
                    <Icon name="Loader2" size={16} className="animate-spin" />
                  ) : (
                    <Icon name={NEXT_STATUS[orderStatus].icon} size={16} />
                  )}
                  <span className="ml-2">{NEXT_STATUS[orderStatus].label}</span>
                </Button>
              )}
              <Button
                variant="outline"
                className="rounded-xl border-white/[0.08] flex-1"
                onClick={() => navigate(`/admin/orders/${editId}/payments`)}
              >
                <Icon name="Banknote" size={16} />
                <span className="ml-2">Оплата</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border-white/[0.08]"
                onClick={exportToExcel}
                disabled={exporting}
              >
                {exporting ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="FileSpreadsheet" size={16} />}
                <span className="ml-2">Excel</span>
              </Button>
            </div>
            {canApplyPricing && (
              <Button
                variant="outline"
                className="rounded-xl border-white/[0.08] w-full"
                onClick={applyPricing}
                disabled={applyingPricing || isLocked}
              >
                {applyingPricing ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Calculator" size={16} />}
                <span className="ml-2">Применить ценообразование</span>
              </Button>
            )}
            <div className="flex gap-2 flex-wrap">
              {orderStatus === "confirmed" && (
                <Button variant="outline" className="rounded-xl border-white/[0.08]" disabled={statusUpdating} onClick={() => updateOrderStatus("new")}>
                  <Icon name="Undo2" size={16} />
                  <span className="ml-1">Отменить подтверждение</span>
                </Button>
              )}
              {orderStatus === "shipped" && (
                <Button variant="outline" className="rounded-xl border-white/[0.08]" disabled={statusUpdating} onClick={() => updateOrderStatus("confirmed")}>
                  <Icon name="Undo2" size={16} />
                  <span className="ml-1">Отменить отгрузку</span>
                </Button>
              )}
              <Button variant="outline" onClick={archiveOrder} className="rounded-xl border-white/[0.08] text-destructive hover:text-destructive">
                <Icon name="Trash2" size={16} />
                <span className="ml-1">Удалить</span>
              </Button>
            </div>
          </div>
        )}

        {editId && orderStatus === "archived" && isOwner && (
          <div className="mt-4 pt-4 border-t border-white/[0.08]">
            <Button className="rounded-xl" disabled={statusUpdating} onClick={() => updateOrderStatus("restore")}>
              {statusUpdating ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="ArchiveRestore" size={16} />}
              <span className="ml-2">Вернуть в работу</span>
            </Button>
          </div>
        )}

        {isOwner && (
          <div className="mt-6 pt-4 border-t border-red-500/30 space-y-2">
            <p className="text-xs text-red-400 font-semibold">ТЕСТ (только для владельца)</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white flex-1"
                onClick={() => {
                  localStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines, wholesalerId }));
                  sessionStorage.setItem("resolve_request", JSON.stringify({
                    returnTo: editId ? `/admin/orders/${editId}/edit` : "/admin/orders/create",
                    context: "order",
                    wholesalerId,
                    customerName,
                    authHeaders,
                  }));
                  navigate("/admin/shared/scan");
                }}
              >
                <Icon name="ScanLine" size={16} />
                <span className="ml-2">ТЕСТ: Сканер</span>
              </Button>
              <Button
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white flex-1"
                onClick={() => {
                  localStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines, wholesalerId }));
                  sessionStorage.setItem("resolve_request", JSON.stringify({
                    returnTo: editId ? `/admin/orders/${editId}/edit` : "/admin/orders/create",
                    context: "order",
                    wholesalerId,
                    customerName,
                    authHeaders,
                  }));
                  navigate("/admin/shared/bulk-paste");
                }}
              >
                <Icon name="ClipboardPaste" size={16} />
                <span className="ml-2">ТЕСТ: Список</span>
              </Button>
            </div>
          </div>
        )}
      </main>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из заявки?</AlertDialogTitle>
            <AlertDialogDescription>Несохранённые данные будут потеряны</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
            <AlertDialogCancel className="rounded-xl border-white/[0.08]">Остаться</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive hover:bg-destructive/90"
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY);
                navigate("/admin/orders");
              }}
            >
              Не сохранять
            </AlertDialogAction>
            <AlertDialogAction
              className="rounded-xl"
              onClick={async () => {
                await handleSave();
                localStorage.removeItem(DRAFT_KEY);
                navigate("/admin/orders");
              }}
            >
              Сохранить и выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default OrderCreatePage;