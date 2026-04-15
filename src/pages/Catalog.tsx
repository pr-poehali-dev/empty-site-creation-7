import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import compressImage from "@/lib/compressImage";

const CATEGORIES_URL = "https://functions.poehali.dev/2a93326d-2932-4f08-9867-b7d3f441d846";
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";

interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  sort_order: number;
  keywords: string[];
}

interface ProductImage {
  id: number;
  url: string;
  sort_order: number;
  thumbnail_url?: string;
}

interface Product {
  id: number;
  category_id: number;
  name: string;
  article: string | null;
  brand: string | null;
  supplier_code: string | null;
  product_group: string | null;
  external_id: string | null;
  is_new: boolean;
  price_base: number | null;
  price_retail: number | null;
  price_wholesale: number | null;
  price_purchase: number | null;
  category_name: string;
  images: ProductImage[];
  barcodes: string[];
}

interface PendingImage {
  data: string;
  content_type: string;
  preview: string;
}

const Catalog = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();
  const isOwner = user.role === "owner";
  const canEdit = isOwner || user.role_name === "Управляющий";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [showMobileCategories, setShowMobileCategories] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<number[]>([]);
  const [deleteProductTarget, setDeleteProductTarget] = useState<Product | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Product | null>(null);
  const [deleteImageTarget, setDeleteImageTarget] = useState<ProductImage | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formName, setFormName] = useState("");
  const [formArticle, setFormArticle] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formSupplierCode, setFormSupplierCode] = useState("");
  const [formProductGroup, setFormProductGroup] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formPriceBase, setFormPriceBase] = useState("");
  const [formPriceRetail, setFormPriceRetail] = useState("");
  const [formPriceWholesale, setFormPriceWholesale] = useState("");
  const [formPricePurchase, setFormPricePurchase] = useState("");
  const [formImages, setFormImages] = useState<PendingImage[]>([]);
  const [formBarcodes, setFormBarcodes] = useState<string[]>([]);
  const [formBarcodeInput, setFormBarcodeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [productGroups, setProductGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>(searchParams.get("group") || "");

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardCategoryId, setWizardCategoryId] = useState("");
  const [wizardArticle, setWizardArticle] = useState("");
  const [wizardChars, setWizardChars] = useState<{ key: string; value: string }[]>([]);
  const [wizardCatDropdownOpen, setWizardCatDropdownOpen] = useState(false);
  const [wizardCatSearch, setWizardCatSearch] = useState("");
  const [wizardArticleDuplicate, setWizardArticleDuplicate] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const resp = await fetch(CATEGORIES_URL, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        setCategories(data.categories || []);
        const roots = (data.categories || []).filter((c: Category) => !c.parent_id);
        setExpandedCategories(new Set(roots.map((c: Category) => c.id)));
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить категории", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchGroups = useCallback(async () => {
    try {
      const resp = await fetch(`${PRODUCTS_URL}?distinct=product_group`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setProductGroups(data.groups || []);
    } catch { /* ignore */ }
  }, [token]);

  const fetchItems = useCallback(async (categoryId: number | null, searchQuery?: string, archived?: boolean, pageNum = 1, append = false, filterGroup?: string) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingItems(true);
    }
    try {
      const params = new URLSearchParams();
      if (categoryId) params.set("category_id", String(categoryId));
      if (searchQuery) params.set("search", searchQuery);
      if (archived) params.set("archived", "true");
      if (filterGroup) params.set("filter_group", filterGroup);
      params.set("page", String(pageNum));
      params.set("per_page", "50");
      const resp = await fetch(`${PRODUCTS_URL}?${params}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        const newItems = data.items || [];
        if (append) {
          setItems(prev => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }
        setTotal(data.total || 0);
        setPage(pageNum);
        setHasMore(pageNum * 50 < (data.total || 0));
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить товары", variant: "destructive" });
    } finally {
      setLoadingItems(false);
      setLoadingMore(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCategories();
    fetchGroups();
  }, []);

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    fetchItems(selectedCategory, search, showArchive, 1, false, selectedGroup);
  }, [selectedCategory, showArchive, selectedGroup]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingItems) {
          fetchItems(selectedCategory, search, showArchive, page + 1, true, selectedGroup);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadingItems, page, selectedCategory, search, showArchive, selectedGroup]);

  useEffect(() => {
    const draftRaw = localStorage.getItem("draft_product");
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw);
        setFormName(draft.formName || "");
        setFormArticle(draft.formArticle || "");
        setFormBrand(draft.formBrand || "");
        setFormSupplierCode(draft.formSupplierCode || "");
        setFormProductGroup(draft.formProductGroup || "");
        setFormCategoryId(draft.formCategoryId || "");
        setFormPriceBase(draft.formPriceBase || "");
        setFormPriceRetail(draft.formPriceRetail || "");
        setFormPriceWholesale(draft.formPriceWholesale || "");
        setFormPricePurchase(draft.formPricePurchase || "");
        setFormBarcodes(Array.isArray(draft.formBarcodes) ? draft.formBarcodes : []);
        setAddOpen(true);
        setEditMode(true);
        localStorage.removeItem("draft_product");
      } catch { /* ignore */ }
    }

    const scannedRaw = localStorage.getItem("scanned_product_barcodes");
    if (scannedRaw) {
      try {
        const scanned: string[] = JSON.parse(scannedRaw);
        if (Array.isArray(scanned) && scanned.length > 0) {
          setFormBarcodes((prev) => {
            const merged = [...prev];
            for (const code of scanned) {
              if (!merged.includes(code)) merged.push(code);
            }
            return merged;
          });
        }
        localStorage.removeItem("scanned_product_barcodes");
      } catch { /* ignore */ }
    }
  }, []);

  const openBarcodeScanner = () => {
    const draft = {
      formName, formArticle, formBrand, formSupplierCode, formCategoryId,
      formPriceBase, formPriceRetail, formPriceWholesale, formPricePurchase,
      formBarcodes,
    };
    localStorage.setItem("draft_product", JSON.stringify(draft));
    localStorage.setItem("scanned_product_barcodes", JSON.stringify(formBarcodes));
    navigate("/admin/scan?returnTo=/admin/catalog&key=scanned_product_barcodes");
  };

  const handleSearch = () => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    fetchItems(selectedCategory, search, showArchive, 1, false, selectedGroup);
  };

  const toggleExpand = (id: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getChildren = (parentId: number | null) =>
    categories.filter((c) => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);

  const getLeafCategories = (): Category[] =>
    categories.filter((c) => !categories.some((ch) => ch.parent_id === c.id));

  const getCategoryPath = (catId: number): string => {
    const parts: string[] = [];
    let current = categories.find((c) => c.id === catId);
    while (current) {
      parts.unshift(current.name);
      current = current.parent_id ? categories.find((c) => c.id === current!.parent_id) : undefined;
    }
    return parts.join(" → ");
  };

  const getSortedLeafCategories = () => {
    const buildOrder = (parentId: number | null): Category[] => {
      const children = categories.filter((c) => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
      const result: Category[] = [];
      for (const child of children) {
        const isLeaf = !categories.some((c) => c.parent_id === child.id);
        if (isLeaf) result.push(child);
        else result.push(...buildOrder(child.id));
      }
      return result;
    };
    return buildOrder(null);
  };

  const getFilteredCategories = () => {
    const sorted = getSortedLeafCategories();
    if (!categorySearch.trim()) return sorted;
    const q = categorySearch.toLowerCase();
    return sorted.filter((c) => getCategoryPath(c.id).toLowerCase().includes(q));
  };

  const suggestedCategory = useMemo(() => {
    const name = formName.toLowerCase().trim();
    if (!name || formCategoryId) return null;
    let best: { category: Category; keyword: string } | null = null;
    for (const cat of categories) {
      if (!cat.keywords || cat.keywords.length === 0) continue;
      for (const kw of cat.keywords) {
        if (name.includes(kw.toLowerCase()) && (!best || kw.length > best.keyword.length)) {
          best = { category: cat, keyword: kw };
        }
      }
    }
    return best;
  }, [formName, formCategoryId, categories]);

  const WIZARD_PRESETS = [
    { key: "Мощность, Вт", label: "Мощность" },
    { key: "Объём, л", label: "Объём" },
    { key: "Цвет", label: "Цвет" },
    { key: "Вес, кг", label: "Вес" },
    { key: "Напряжение, В", label: "Напряжение" },
  ];

  const getWizardLeafCategories = () => {
    const leaves = getSortedLeafCategories().filter((c) => c.keywords && c.keywords.length > 0);
    if (!wizardCatSearch.trim()) return leaves;
    const q = wizardCatSearch.toLowerCase();
    return leaves.filter((c) => getCategoryPath(c.id).toLowerCase().includes(q));
  };

  const generateWizardName = () => {
    const cat = categories.find((c) => c.id === Number(wizardCategoryId));
    if (!cat || !cat.keywords || cat.keywords.length === 0) return "";
    const base = cat.keywords[0].charAt(0).toUpperCase() + cat.keywords[0].slice(1);
    let result = base;
    if (wizardArticle.trim()) result += " " + wizardArticle.trim();
    for (const ch of wizardChars) {
      if (!ch.value.trim()) continue;
      const parts = ch.key.split(",");
      const unit = parts.length > 1 ? parts[1].trim() : "";
      result += ", " + ch.value.trim() + (unit ? " " + unit : "");
    }
    return result;
  };

  const handleWizardArticleBlur = () => {
    const art = wizardArticle.trim();
    if (!art) { setWizardArticleDuplicate(null); return; }
    const dup = items.find((i) => i.article && i.article.toLowerCase() === art.toLowerCase());
    setWizardArticleDuplicate(dup ? dup.name : null);
  };

  const openWizard = () => {
    const lastCat = localStorage.getItem("wizard_last_category_id") || "";
    setWizardCategoryId(lastCat);
    setWizardArticle("");
    setWizardChars([]);
    setWizardCatSearch("");
    setWizardCatDropdownOpen(false);
    setWizardArticleDuplicate(null);
    setWizardOpen(true);
  };

  const handleWizardApply = () => {
    const name = generateWizardName();
    if (!name) return;
    setFormName(name);
    setFormCategoryId(wizardCategoryId);
    if (wizardArticle.trim()) setFormArticle(wizardArticle.trim());
    if (wizardCategoryId) localStorage.setItem("wizard_last_category_id", wizardCategoryId);
    setWizardOpen(false);
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const compressed = await compressImage(file);
        setFormImages((prev) => [...prev, compressed]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось обработать фото";
        toast({ title: "Ошибка фото", description: msg, variant: "destructive" });
      }
    }
  };

  const removeImage = (index: number) => {
    setFormImages((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFormName("");
    setFormArticle("");
    setFormBrand("");
    setFormSupplierCode("");
    setFormProductGroup("");
    setFormCategoryId("");
    setFormPriceBase("");
    setFormPriceRetail("");
    setFormPriceWholesale("");
    setFormPricePurchase("");
    setFormImages([]);
    setFormBarcodes([]);
    setFormBarcodeInput("");
    setCategorySearch("");
    setEditingProduct(null);
    setExistingImages([]);
    setRemovedImageIds([]);
    setEditMode(false);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormArticle(product.article || "");
    setFormBrand(product.brand || "");
    setFormSupplierCode(product.supplier_code || "");
    setFormProductGroup(product.product_group || "");
    setFormCategoryId(String(product.category_id));
    setFormPriceBase(product.price_base != null ? String(product.price_base) : "");
    setFormPriceRetail(product.price_retail != null ? String(product.price_retail) : "");
    setFormPriceWholesale(product.price_wholesale != null ? String(product.price_wholesale) : "");
    setFormPricePurchase(product.price_purchase != null ? String(product.price_purchase) : "");
    setFormBarcodes(Array.isArray(product.barcodes) ? [...product.barcodes] : []);
    setFormImages([]);
    setExistingImages([...product.images]);
    setRemovedImageIds([]);
    setAddOpen(true);
  };

  const isFieldDisabled = (fieldName: string) => {
    if (!editingProduct) return false;
    if (!editMode) return true;
    if (isOwner) return false;
    const priceFields = ['price_base', 'price_retail', 'price_wholesale'];
    return !priceFields.includes(fieldName);
  };

  const confirmRemoveImage = () => {
    if (!deleteImageTarget) return;
    setRemovedImageIds((prev) => [...prev, deleteImageTarget.id]);
    setExistingImages((prev) => prev.filter((img) => img.id !== deleteImageTarget.id));
    setDeleteImageTarget(null);
  };

  const confirmArchiveProduct = async () => {
    if (!deleteProductTarget) return;
    const id = deleteProductTarget.id;
    const name = deleteProductTarget.name;
    setDeleteProductTarget(null);
    try {
      const resp = await fetch(`${PRODUCTS_URL}?id=${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Товар в архиве", description: name });
        setItems([]); setPage(1); setHasMore(true);
        fetchItems(selectedCategory, search, showArchive, 1, false, selectedGroup);
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось архивировать товар", variant: "destructive" });
    }
  };

  const handleRestore = async (product: Product) => {
    try {
      const resp = await fetch(`${PRODUCTS_URL}?id=${product.id}&action=restore`, {
        method: "PATCH",
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Товар восстановлен", description: product.name });
        setItems([]); setPage(1); setHasMore(true);
        fetchItems(selectedCategory, search, showArchive, 1, false, selectedGroup);
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось восстановить товар", variant: "destructive" });
    }
  };

  const handlePermanentDelete = async (product: Product) => {
    try {
      const resp = await fetch(`${PRODUCTS_URL}?id=${product.id}&permanent=true`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Товар удалён навсегда", description: product.name });
        setItems([]); setPage(1); setHasMore(true);
        fetchItems(selectedCategory, search, showArchive, 1, false, selectedGroup);
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось удалить товар", variant: "destructive" });
    }
  };

  const addBarcode = () => {
    const val = formBarcodeInput.trim();
    if (!val) return;
    if (formBarcodes.includes(val)) {
      toast({ title: "Этот штрихкод уже добавлен", variant: "destructive" });
      return;
    }
    setFormBarcodes((prev) => [...prev, val]);
    setFormBarcodeInput("");
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: "Ошибка", description: "Укажите название", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        category_id: formCategoryId ? Number(formCategoryId) : null,
        article: formArticle.trim() || null,
        brand: formBrand.trim() || null,
        supplier_code: formSupplierCode.trim() || null,
        product_group: formProductGroup.trim() || null,
        price_base: formPriceBase ? Number(formPriceBase) : null,
        price_retail: formPriceRetail ? Number(formPriceRetail) : null,
        price_wholesale: formPriceWholesale ? Number(formPriceWholesale) : null,
        images: formImages.map((img) => ({ data: img.data, content_type: img.content_type })),
        barcodes: formBarcodes,
      };
      if (isOwner) {
        payload.price_purchase = formPricePurchase ? Number(formPricePurchase) : null;
      }

      let resp: Response;
      if (editingProduct) {
        payload.remove_images = removedImageIds;
        resp = await fetch(`${PRODUCTS_URL}?id=${editingProduct.id}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
      } else {
        resp = await fetch(PRODUCTS_URL, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
      }
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: editingProduct ? "Товар обновлён" : "Товар добавлен" });
        setAddOpen(false);
        resetForm();
        setItems([]); setPage(1); setHasMore(true);
        fetchItems(selectedCategory, search, showArchive, 1, false, selectedGroup);
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/admin");
  };

  const goBack = () => {
    if (isOwner) navigate("/admin/dashboard");
    else navigate("/admin/manager");
  };

  const renderCategoryTree = (parentId: number | null, depth: number = 0) => {
    const children = getChildren(parentId);
    if (!children.length) return null;

    return (
      <div className={depth > 0 ? "ml-3" : ""}>
        {children.map((cat) => {
          const hasChildren = categories.some((c) => c.parent_id === cat.id);
          const isExpanded = expandedCategories.has(cat.id);
          const isSelected = selectedCategory === cat.id;

          return (
            <div key={cat.id}>
              <div
                className={`w-full flex items-center rounded-lg text-sm transition-colors text-left ${
                  isSelected
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-white/[0.06] text-foreground"
                }`}
              >
                {hasChildren ? (
                  <button
                    className="flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-lg hover:bg-white/[0.1] transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(cat.id);
                    }}
                  >
                    <Icon
                      name={isExpanded ? "ChevronDown" : "ChevronRight"}
                      size={16}
                      className="text-muted-foreground"
                    />
                  </button>
                ) : (
                  <span className="w-8" />
                )}
                <button
                  className="flex-1 text-left py-1.5 pr-2 truncate"
                  onClick={() => {
                    setSelectedCategory(isSelected ? null : cat.id);
                    setShowMobileCategories(false);
                  }}
                >
                  {cat.name}
                </button>
              </div>
              {hasChildren && isExpanded && renderCategoryTree(cat.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  const selectedCategoryName = selectedCategory
    ? categories.find((c) => c.id === selectedCategory)?.name
    : "Все товары";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goBack}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold">{showArchive ? "Архив товаров" : "Каталог"}</h1>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !showArchive && (
              <Button
                className="h-9"
                onClick={() => {
                  resetForm();
                  if (selectedCategory) setFormCategoryId(String(selectedCategory));
                  setAddOpen(true);
                  setEditMode(true);
                }}
              >
                <Icon name="Plus" size={16} />
                <span className="ml-1 hidden sm:inline">Добавить товар</span>
                <span className="ml-1 sm:hidden">Добавить</span>
              </Button>
            )}
            {canEdit && (
              <Button
                variant={showArchive ? "default" : "outline"}
                size="sm"
                className={`h-9 ${showArchive ? "" : "border-white/[0.08]"}`}
                onClick={() => setShowArchive(!showArchive)}
              >
                <Icon name="Archive" size={16} />
                <span className="ml-1 hidden sm:inline">{showArchive ? "Каталог" : "Архив"}</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleLogout}>
              <Icon name="LogOut" size={16} />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-6xl mx-auto w-full">
        {/* Mobile categories toggle */}
        <div className="lg:hidden border-b border-white/[0.08] px-4 py-2">
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground"
            onClick={() => setShowMobileCategories(!showMobileCategories)}
          >
            <Icon name="LayoutList" size={16} />
            <span>{selectedCategoryName}</span>
            <Icon name={showMobileCategories ? "ChevronUp" : "ChevronDown"} size={14} />
          </button>
          {showMobileCategories && (
            <div className="mt-2 pb-2 max-h-60 overflow-y-auto">
              <button
                className={`w-full text-left px-2 py-1.5 rounded-lg text-sm mb-1 ${
                  !selectedCategory ? "bg-primary/20 text-primary" : "hover:bg-white/[0.06]"
                }`}
                onClick={() => { setSelectedCategory(null); setShowMobileCategories(false); }}
              >
                Все товары
              </button>
              {renderCategoryTree(null)}
            </div>
          )}
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-60 flex-shrink-0 border-r border-white/[0.08] p-4 overflow-y-auto">
          <button
            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm mb-1 ${
              !selectedCategory ? "bg-primary/20 text-primary" : "hover:bg-white/[0.06]"
            }`}
            onClick={() => setSelectedCategory(null)}
          >
            Все товары
          </button>
          {renderCategoryTree(null)}
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <Input
              placeholder="Поиск по названию, артикулу, бренду..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-9 rounded-xl bg-secondary border-white/[0.08] text-sm"
            />
            <Button variant="outline" size="sm" className="h-9 px-3 flex-shrink-0" onClick={handleSearch}>
              <Icon name="Search" size={16} />
            </Button>
          </div>

          {productGroups.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="h-9 rounded-xl bg-secondary border border-white/[0.08] text-sm px-3 text-foreground min-w-0 flex-1 max-w-xs"
              >
                <option value="">Все группы</option>
                {productGroups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              {selectedGroup && (
                <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => setSelectedGroup("")}>
                  <Icon name="X" size={14} />
                </Button>
              )}
              {isOwner && (
                <Button variant="outline" size="sm" className="h-9 flex-shrink-0" onClick={() => navigate("/admin/product-groups")}>
                  <Icon name="FolderTree" size={16} />
                  <span className="ml-1 hidden sm:inline">Группы</span>
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              {selectedCategoryName}{selectedGroup ? ` · ${selectedGroup}` : ""} · {total} {total === 1 ? "позиция" : "позиций"}
            </p>
          </div>

          {loadingItems ? (
            <div className="flex justify-center py-12">
              <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Icon name={showArchive ? "Archive" : "Package"} size={48} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">{showArchive ? "Архив пуст" : "Нет товаров"}</p>
              {!showArchive && (
                <p className="text-sm text-muted-foreground mt-1">Нажмите «Добавить товар» для создания</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/[0.08] bg-card p-3 sm:p-4 flex gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => { handleEdit(item); setEditMode(false); }}
                >
                  {item.images.length > 0 ? (
                    <img
                      src={item.images[0].thumbnail_url || item.images[0].url}
                      alt={item.name}
                      loading="lazy"
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                      <Icon name="Image" size={20} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm sm:text-base truncate">{item.name}</p>
                      {item.is_new && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs flex-shrink-0">Новый</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {item.article && (
                        <Badge className="bg-white/[0.06] text-muted-foreground border-white/[0.08] text-xs">
                          {item.article}
                        </Badge>
                      )}
                      {item.brand && (
                        <Badge className="bg-white/[0.06] text-muted-foreground border-white/[0.08] text-xs">
                          {item.brand}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{item.category_name}</span>
                    </div>
                    {item.barcodes && item.barcodes.length > 0 && (
                      <p className="text-xs text-muted-foreground italic mt-0.5 truncate">
                        {item.barcodes.join(", ")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs">
                      {item.price_base != null && (
                        <span>Базовая: <span className="text-foreground font-medium">{item.price_base.toLocaleString()} ₽</span></span>
                      )}
                      {item.price_retail != null && (
                        <span>Розница: <span className="text-foreground font-medium">{item.price_retail.toLocaleString()} ₽</span></span>
                      )}
                      {item.price_wholesale != null && (
                        <span>Опт: <span className="text-foreground font-medium">{item.price_wholesale.toLocaleString()} ₽</span></span>
                      )}
                      {isOwner && item.price_purchase != null && (
                        <span className="text-yellow-400">Закуп: <span className="font-medium">{item.price_purchase.toLocaleString()} ₽</span></span>
                      )}
                    </div>
                  </div>
                  {canEdit && !showArchive && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-yellow-500/20 transition-colors text-muted-foreground hover:text-yellow-400"
                        onClick={(e) => { e.stopPropagation(); setDeleteProductTarget(item); }}
                        title="В архив"
                      >
                        <Icon name="Archive" size={14} />
                      </button>
                    </div>
                  )}
                  {canEdit && showArchive && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-green-500/20 transition-colors text-muted-foreground hover:text-green-400"
                        onClick={(e) => { e.stopPropagation(); handleRestore(item); }}
                        title="Восстановить"
                      >
                        <Icon name="ArchiveRestore" size={14} />
                      </button>
                      <button
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setPermanentDeleteTarget(item); }}
                        title="Удалить навсегда"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {hasMore && !loadingItems && items.length > 0 && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore && <Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" />}
            </div>
          )}
        </main>
      </div>

      {/* Add/edit product dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); resetForm(); } }}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? (editMode ? "Редактировать товар" : editingProduct.name) : "Добавить товар"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Название *</label>
                {!isFieldDisabled("name") && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                    onClick={openWizard}
                  >
                    <Icon name="Wand2" size={14} />
                    Создать наименование
                  </button>
                )}
              </div>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Холодильник Samsung RB37"
                disabled={isFieldDisabled("name")}
                className="h-10 rounded-xl bg-secondary border-white/[0.08]"
              />
              {suggestedCategory && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-xs">
                  <Icon name="Lightbulb" size={14} className="text-primary shrink-0" />
                  <span className="truncate">{getCategoryPath(suggestedCategory.category.id)}</span>
                  <button
                    type="button"
                    className="ml-auto shrink-0 text-primary font-medium hover:underline"
                    onClick={() => setFormCategoryId(String(suggestedCategory.category.id))}
                  >
                    Применить
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Артикул</label>
                <Input
                  value={formArticle}
                  onChange={(e) => setFormArticle(e.target.value)}
                  disabled={isFieldDisabled("article")}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Бренд</label>
                <Input
                  value={formBrand}
                  onChange={(e) => setFormBrand(e.target.value)}
                  disabled={isFieldDisabled("brand")}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Код поставщика</label>
                <Input
                  value={formSupplierCode}
                  onChange={(e) => setFormSupplierCode(e.target.value)}
                  disabled={isFieldDisabled("supplier_code")}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Группа</label>
                <Input
                  value={formProductGroup}
                  onChange={(e) => setFormProductGroup(e.target.value)}
                  disabled={isFieldDisabled("product_group")}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
            </div>
            {editingProduct?.external_id && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">UUID (1С)</label>
                <Input
                  value={editingProduct.external_id}
                  disabled
                  className="h-10 rounded-xl bg-secondary border-white/[0.08] text-xs font-mono"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Категория</label>
              <div className="relative">
                <button
                  type="button"
                  className="w-full h-10 rounded-xl bg-secondary border border-white/[0.08] px-3 text-left text-sm truncate"
                  disabled={isFieldDisabled("category")}
                  onClick={() => !isFieldDisabled("category") && setCategoryDropdownOpen(!categoryDropdownOpen)}
                >
                  {formCategoryId
                    ? getCategoryPath(Number(formCategoryId))
                    : <span className="text-muted-foreground">Без категории</span>}
                </button>
                {categoryDropdownOpen && !isFieldDisabled("category") && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-card overflow-hidden shadow-lg">
                    <div className="p-2">
                      <Input
                        placeholder="П��иск категории..."
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        className="h-8 rounded-lg bg-secondary border-white/[0.08] text-xs"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {getFilteredCategories().map((cat) => (
                        <button
                          key={cat.id}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-white/[0.06] transition-colors ${
                            formCategoryId === String(cat.id) ? "bg-primary/20 text-primary" : ""
                          }`}
                          onClick={() => {
                            setFormCategoryId(String(cat.id));
                            setCategoryDropdownOpen(false);
                            setCategorySearch("");
                          }}
                        >
                          {getCategoryPath(cat.id)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Штрихкоды</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Введите штрихкод"
                  value={formBarcodeInput}
                  onChange={(e) => setFormBarcodeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBarcode(); } }}
                  disabled={isFieldDisabled("barcodes")}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08] text-sm flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 w-10 p-0 rounded-xl border-white/[0.08]"
                  disabled={isFieldDisabled("barcodes")}
                  onClick={addBarcode}
                >
                  <Icon name="Plus" size={16} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 w-10 p-0 rounded-xl border-white/[0.08]"
                  disabled={isFieldDisabled("barcodes")}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openBarcodeScanner();
                  }}
                >
                  <Icon name="Camera" size={16} />
                </Button>
              </div>
              {formBarcodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {formBarcodes.map((bc, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] text-xs">
                      {bc}
                      {isOwner && (
                        <button onClick={() => setFormBarcodes((prev) => prev.filter((_, idx) => idx !== i))}>
                          <Icon name="X" size={12} className="text-muted-foreground hover:text-destructive" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Цены</label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  placeholder="Базовая"
                  value={formPriceBase}
                  onChange={(e) => setFormPriceBase(e.target.value)}
                  disabled={isFieldDisabled("price_base")}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
                <Input
                  type="number"
                  placeholder="Розничная"
                  value={formPriceRetail}
                  onChange={(e) => setFormPriceRetail(e.target.value)}
                  disabled={isFieldDisabled("price_retail")}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
                <Input
                  type="number"
                  placeholder="Оптовая"
                  value={formPriceWholesale}
                  onChange={(e) => setFormPriceWholesale(e.target.value)}
                  disabled={isFieldDisabled("price_wholesale")}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
                {isOwner && (
                  <Input
                    type="number"
                    placeholder="Закупочная"
                    value={formPricePurchase}
                    onChange={(e) => setFormPricePurchase(e.target.value)}
                    disabled={isFieldDisabled("price_purchase")}
                    className="h-10 rounded-xl bg-secondary border-yellow-500/30"
                  />
                )}
              </div>
            </div>

            {editingProduct && existingImages.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Текущие фото</label>
                <div className="flex gap-2 flex-wrap">
                  {existingImages.map((img) => (
                    <div key={img.id} className="relative w-16 h-16">
                      <img src={img.url} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover" />
                      {!isFieldDisabled("images") && (
                        <button
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive flex items-center justify-center"
                          onClick={() => setDeleteImageTarget(img)}
                        >
                          <Icon name="X" size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isFieldDisabled("images") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {editingProduct ? "Добавить фото" : "Фотографии"}
              </label>
              <div className="flex gap-2 flex-wrap">
                {formImages.map((img, i) => (
                  <div key={i} className="relative w-16 h-16">
                    <img src={img.preview} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover" />
                    <button
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive flex items-center justify-center"
                      onClick={() => removeImage(i)}
                    >
                      <Icon name="X" size={12} />
                    </button>
                  </div>
                ))}
                <button
                  className="w-16 h-16 rounded-lg border border-dashed border-white/[0.15] flex items-center justify-center hover:bg-white/[0.04] transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="ImagePlus" size={20} className="text-muted-foreground" />
                </button>
                <button
                  className="w-16 h-16 rounded-lg border border-dashed border-white/[0.15] flex items-center justify-center hover:bg-white/[0.04] transition-colors"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Icon name="Camera" size={20} className="text-muted-foreground" />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editingProduct && !editMode && canEdit && (
              <Button variant="outline" onClick={() => setEditMode(true)} className="rounded-xl border-white/[0.08] mr-auto">
                <Icon name="Pencil" size={16} />
                <span className="ml-1">Редактировать</span>
              </Button>
            )}
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }} className="rounded-xl border-white/[0.08]">
              {editingProduct && !editMode ? "Закрыть" : "Отмена"}
            </Button>
            {(!editingProduct || editMode) && (
              <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                {saving ? (
                  <Icon name="Loader2" size={18} className="animate-spin" />
                ) : (
                  <Icon name="Check" size={18} />
                )}
                <span className="ml-2">{saving ? "Сохранение..." : editingProduct ? "Сохранить" : "Добавить"}</span>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="Wand2" size={18} />
              Создать наименование
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Категория</label>
              <div className="relative">
                <button
                  type="button"
                  className="w-full h-10 rounded-xl bg-secondary border border-white/[0.08] px-3 text-left text-sm truncate"
                  onClick={() => setWizardCatDropdownOpen(!wizardCatDropdownOpen)}
                >
                  {wizardCategoryId
                    ? getCategoryPath(Number(wizardCategoryId))
                    : <span className="text-muted-foreground">Выберите категорию</span>}
                </button>
                {wizardCatDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-card overflow-hidden shadow-lg">
                    <div className="p-2">
                      <Input
                        placeholder="Поиск категории..."
                        value={wizardCatSearch}
                        onChange={(e) => setWizardCatSearch(e.target.value)}
                        className="h-8 rounded-lg bg-secondary border-white/[0.08] text-xs"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {getWizardLeafCategories().map((cat) => (
                        <button
                          key={cat.id}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-white/[0.06] transition-colors ${
                            wizardCategoryId === String(cat.id) ? "bg-primary/20 text-primary" : ""
                          }`}
                          onClick={() => {
                            setWizardCategoryId(String(cat.id));
                            setWizardCatDropdownOpen(false);
                            setWizardCatSearch("");
                          }}
                        >
                          {getCategoryPath(cat.id)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Артикул</label>
              <Input
                value={wizardArticle}
                onChange={(e) => { setWizardArticle(e.target.value); setWizardArticleDuplicate(null); }}
                onBlur={handleWizardArticleBlur}
                placeholder="КТ-7213"
                className="h-10 rounded-xl bg-secondary border-white/[0.08]"
              />
              {wizardArticleDuplicate && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 text-xs text-yellow-400">
                  <Icon name="AlertTriangle" size={14} className="shrink-0" />
                  <span>Товар с таким артикулом уже есть: {wizardArticleDuplicate}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Характеристики</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {WIZARD_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs transition-colors"
                    onClick={() => {
                      if (!wizardChars.some((c) => c.key === preset.key)) {
                        setWizardChars((prev) => [...prev, { key: preset.key, value: "" }]);
                      }
                    }}
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
              {wizardChars.map((ch, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={ch.key}
                    onChange={(e) => setWizardChars((prev) => prev.map((c, j) => j === i ? { ...c, key: e.target.value } : c))}
                    placeholder="Параметр"
                    className="h-9 rounded-lg bg-secondary border-white/[0.08] text-xs flex-1"
                  />
                  <Input
                    value={ch.value}
                    onChange={(e) => setWizardChars((prev) => prev.map((c, j) => j === i ? { ...c, value: e.target.value } : c))}
                    placeholder="Значение"
                    className="h-9 rounded-lg bg-secondary border-white/[0.08] text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setWizardChars((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Icon name="X" size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                onClick={() => setWizardChars((prev) => [...prev, { key: "", value: "" }])}
              >
                <Icon name="Plus" size={14} />
                Добавить характеристику
              </button>
            </div>

            {generateWizardName() && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">Результат</label>
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm font-medium">
                  {generateWizardName()}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setWizardOpen(false)} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <Button onClick={handleWizardApply} disabled={!generateWizardName()} className="rounded-xl">
              <Icon name="Check" size={18} />
              <span className="ml-2">Применить</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteProductTarget} onOpenChange={(open) => { if (!open) setDeleteProductTarget(null); }}>
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Отправить в архив?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteProductTarget?.name}» будет скрыт из каталога и поиска. Товар можно будет восстановить из архива.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmArchiveProduct}
              className="rounded-xl bg-yellow-600 text-white hover:bg-yellow-700"
            >
              В архив
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!permanentDeleteTarget} onOpenChange={(open) => { if (!open) setPermanentDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить навсегда?</AlertDialogTitle>
            <AlertDialogDescription>
              «{permanentDeleteTarget?.name}» будет удалён безвозвратно вместе со всеми фото и штрихкодами. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (permanentDeleteTarget) { handlePermanentDelete(permanentDeleteTarget); setPermanentDeleteTarget(null); } }}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteImageTarget} onOpenChange={(open) => { if (!open) setDeleteImageTarget(null); }}>
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить фото?</AlertDialogTitle>
            <AlertDialogDescription>
              Фотография будет удалена из товара после сохранения изменений.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveImage}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Catalog;