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
import Icon from "@/components/ui/icon";

const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const WHOLESALERS_URL = "https://functions.poehali.dev/03df983f-e7e9-4cd5-9427-e61b88d1171f";
const PRICING_URL = "https://functions.poehali.dev/8b1df5ee-7914-4801-aa0f-3bd851bdb4a0";
const TEMP_PRODUCTS_URL = "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";

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

  // Temp product form state
  const [showTempForm, setShowTempForm] = useState(false);
  const [tempBrand, setTempBrand] = useState("");
  const [tempArticle, setTempArticle] = useState("");
  const [tempQty, setTempQty] = useState("1");
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

  const calcPrice = (item: ProductSearchItem, rules: PricingRule[]): number => {
    let matchedRule: PricingRule | null = null;
    for (const rule of rules) {
      if (rule.filter_type === "product_group" && item.product_group === rule.filter_value) {
        matchedRule = rule;
      }
    }
    if (matchedRule) {
      const priceMap: Record<string, number | null> = {
        price_base: item.price_base,
        price_retail: item.price_retail,
        price_wholesale: item.price_wholesale,
        price_purchase: item.price_purchase,
      };
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
    const saved = sessionStorage.getItem(DRAFT_KEY);
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
            const newLines: OrderLine[] = [];
            for (const entry of entries) {
              if (entry.product_id) {
                try {
                  const resp = await fetch(`${PRODUCTS_URL}?id=${entry.product_id}`, { headers: authHeaders });
                  const data = await resp.json();
                  const product = data.item;
                  if (product) {
                    newLines.push({
                      product_id: product.id,
                      name: product.name,
                      article: product.article,
                      quantity: 1,
                      price: (entry.price && entry.price > 0) ? entry.price : calcPrice(product, rules),
                      has_uuid: !!product.external_id,
                    });
                  }
                } catch { /* ignore */ }
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
              }
            }
            setLines([...newLines, ...savedLines]);
            if (!editId) canSaveDraftRef.current = true;
          };
          loadScanned();
          return;
        }
      } catch { /* ignore */ }
    }

    if (savedLines.length > 0) setLines(savedLines);
    if (!editId) canSaveDraftRef.current = true;
  }, []);

  useEffect(() => {
    if (!canSaveDraftRef.current) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines, wholesalerId }));
  }, [customerName, comment, lines, wholesalerId]);

  useEffect(() => {
    if (!editId) return;
    const draft = sessionStorage.getItem(DRAFT_KEY);
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
        toast({ title: "Не найдено", description: "Штрихкод не найден в каталоге", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

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
      const resp = await fetch(`${PRODUCTS_URL}?search=&per_page=200`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok && data.items) {
        const brands = [...new Set<string>(
          data.items.map((p: ProductSearchItem) => p.brand).filter(Boolean)
        )].sort() as string[];
        setAllBrands(brands);
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
    if (!tempBrand.trim() || !tempArticle.trim() || !tempQty || !tempPrice) {
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
          quantity: parseFloat(tempQty),
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
            quantity: parseFloat(tempQty),
            price: parseFloat(tempPrice),
            is_temp: true,
            has_uuid: false,
          },
          ...prev,
        ]);
        setShowTempForm(false);
        setTempBrand("");
        setTempArticle("");
        setTempQty("1");
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
          })),
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        sessionStorage.removeItem(DRAFT_KEY);
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
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        <div className="flex gap-1 mb-3 items-start">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide flex-1" style={{scrollbarWidth: 'none'}}>
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
                      {tp.price ? `${tp.price.toLocaleString()} ₽` : "—"}
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
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Input
                placeholder="Количество *"
                type="number"
                value={tempQty}
                onChange={(e) => setTempQty(e.target.value)}
                className="h-9 rounded-lg bg-secondary border-white/[0.08] text-sm"
              />
              <Input
                placeholder="Цена *"
                type="number"
                value={tempPrice}
                onChange={(e) => setTempPrice(e.target.value)}
                className="h-9 rounded-lg bg-secondary border-white/[0.08] text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-lg flex-1" onClick={saveTempProduct} disabled={savingTemp}>
                {savingTemp ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
                <span className="ml-1">Добавить</span>
              </Button>
              <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => { setShowTempForm(false); setTempBrand(""); setTempArticle(""); setTempQty("1"); setTempPrice(""); }}>
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
            {isMobile && (
              <button
                className="w-10 h-10 rounded-xl border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.06] flex-shrink-0"
                onClick={() => {
                  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, comment, lines, wholesalerId }));
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
          <div className="relative flex-1" ref={wholesalerRef}>
            <Input
              value={customerName}
              onChange={(e) => { setCustomerName(e.target.value); setShowWholesalerList(true); }}
              onFocus={() => setShowWholesalerList(true)}
              placeholder="Оптовик *"
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
            {lines.map((line, i) => {
              const isRedLine = line.is_temp === true || (line.product_id && line.has_uuid === false);
              return (
                <div
                  key={i}
                  className={`rounded-lg border p-2.5 ${
                    isRedLine
                      ? "border-red-500/30 bg-red-950/20"
                      : "border-white/[0.08] bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm truncate">{line.name}</p>
                        {isRedLine && (
                          <span className="text-xs text-red-400 flex-shrink-0">новый</span>
                        )}
                      </div>
                      {line.article && <p className="text-xs text-muted-foreground">{line.article}</p>}
                    </div>
                    <button
                      className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                      onClick={() => removeLine(i)}
                    >
                      <Icon name="X" size={14} className="text-destructive" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08]"
                        onClick={() => updateQty(i, line.quantity - 1)}
                      >
                        <Icon name="Minus" size={10} />
                      </button>
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateQty(i, parseFloat(e.target.value) || 1)}
                        className="w-12 h-6 text-center text-xs p-0 bg-white/[0.04] border-white/[0.08] rounded"
                      />
                      <button
                        className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08]"
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
                        className="w-20 h-6 text-right text-xs p-1 bg-white/[0.04] border-white/[0.08] rounded"
                      />
                      <span className="text-xs text-muted-foreground">₽</span>
                    </div>
                    <span className="text-xs font-medium flex-shrink-0">
                      = {(line.price * line.quantity).toLocaleString()} ₽
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4">
          <Button className="w-full h-11 rounded-xl" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              <Icon name="Check" size={16} />
            )}
            <span className="ml-2">{saving ? "Сохранение..." : "Сохранить"}</span>
          </Button>
        </div>

        {editId && orderStatus !== "archived" && orderStatus !== "completed" && (
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
            </div>
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
                sessionStorage.removeItem(DRAFT_KEY);
                navigate("/admin/orders");
              }}
            >
              Не сохранять
            </AlertDialogAction>
            <AlertDialogAction
              className="rounded-xl"
              onClick={async () => {
                await handleSave();
                sessionStorage.removeItem(DRAFT_KEY);
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