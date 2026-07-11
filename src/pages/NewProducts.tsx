import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import DebugBadge from "@/components/DebugBadge";

const TEMP_PRODUCTS_URL = "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const CATEGORIES_URL = "https://functions.poehali.dev/2a93326d-2932-4f08-9867-b7d3f441d846";
const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";

interface UsedOrder {
  id: number;
  customer_name: string;
  created_at: string | null;
}

interface OrderItem {
  id: number;
  name: string;
  article: string | null;
  quantity: number;
  price: number;
  amount: number;
}

interface OrderView {
  id: number;
  customer_name: string;
  comment: string | null;
  created_at: string | null;
  created_by: string;
  items: OrderItem[];
}

interface TempProduct {
  id: number;
  brand: string;
  article: string;
  quantity: number;
  price: number;
  status: string;
  nomenclature_id: number | null;
  created_at: string | null;
  usage_count: number;
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

const NewProducts = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [activeItems, setActiveItems] = useState<TempProduct[]>([]);
  const [historyItems, setHistoryItems] = useState<TempProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTotal, setActiveTotal] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const ACTIVE_PER_PAGE = 50;

  const [addDialog, setAddDialog] = useState<TempProduct | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editBrand, setEditBrand] = useState("");
  const [editArticle, setEditArticle] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<number | null>(null);
  const [formPriceBase, setFormPriceBase] = useState("");
  const [formPriceRetail, setFormPriceRetail] = useState("");
  const [formPriceWholesale, setFormPriceWholesale] = useState("");
  const [formPricePurchase, setFormPricePurchase] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCatList, setShowCatList] = useState(false);

  // Delete / replace
  const [deleteItem, setDeleteItem] = useState<TempProduct | null>(null);
  const [replaceSearch, setReplaceSearch] = useState("");
  const [replaceResults, setReplaceResults] = useState<{ id: number; name: string; article: string | null; brand: string | null; price_wholesale?: number | null; is_temp?: boolean; temp_id?: number }[]>([]);
  const [replaceSelected, setReplaceSelected] = useState<{ id: number | null; temp_id: number | null; name: string; price: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const replaceDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Простое удаление (товар без заявок)
  const [simpleDeleteItem, setSimpleDeleteItem] = useState<TempProduct | null>(null);

  // Заявки, где используется товар (для ссылок) + модалка просмотра заявки
  const [usedOrders, setUsedOrders] = useState<UsedOrder[]>([]);
  const [orderView, setOrderView] = useState<OrderView | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [highlightName, setHighlightName] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [activeResp, histResp] = await Promise.all([
        fetch(`${TEMP_PRODUCTS_URL}?status=pending&page=1&per_page=${ACTIVE_PER_PAGE}`, { headers: authHeaders }),
        fetch(`${TEMP_PRODUCTS_URL}?status=added&per_page=100`, { headers: authHeaders }),
      ]);
      const activeData = await activeResp.json();
      const histData = await histResp.json();
      if (activeResp.ok) {
        setActiveItems(activeData.items || []);
        setActiveTotal(activeData.total || 0);
        setActivePage(1);
      }
      if (histResp.ok) setHistoryItems(histData.items || []);
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadMoreActive = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = activePage + 1;
      const resp = await fetch(`${TEMP_PRODUCTS_URL}?status=pending&page=${nextPage}&per_page=${ACTIVE_PER_PAGE}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        setActiveItems((prev) => [...prev, ...(data.items || [])]);
        setActiveTotal(data.total || 0);
        setActivePage(nextPage);
      }
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  }, [token, activePage]);

  const removeActiveLocal = (id: number) => {
    setActiveItems((prev) => prev.filter((it) => it.id !== id));
    setActiveTotal((prev) => Math.max(0, prev - 1));
  };

  const loadHistory = useCallback(async () => {
    try {
      const resp = await fetch(`${TEMP_PRODUCTS_URL}?status=added&per_page=100`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setHistoryItems(data.items || []);
    } catch { /* ignore */ }
  }, [token]);

  const loadCategories = useCallback(async () => {
    try {
      const resp = await fetch(CATEGORIES_URL, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setCategories(data.items || []);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    loadData();
    loadCategories();
  }, []);

  const openAddDialog = (item: TempProduct) => {
    setAddDialog(item);
    setEditMode(false);
    setFormName(`${item.brand} ${item.article}`);
    setFormCategory("");
    setFormCategoryId(null);
    setFormPriceBase("");
    setFormPriceRetail("");
    setFormPriceWholesale(String(item.price || ""));
    setFormPricePurchase("");
    setEditBrand(item.brand);
    setEditArticle(item.article);
    setEditPrice(String(item.price || ""));
  };

  const handleSaveEdit = async () => {
    if (!addDialog) return;
    if (!editBrand.trim() || !editArticle.trim()) {
      toast({ title: "Бренд и артикул обязательны", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      const resp = await fetch(`${TEMP_PRODUCTS_URL}?id=${addDialog.id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          brand: editBrand.trim(),
          article: editArticle.trim(),
          price: parseFloat(editPrice || "0") || 0,
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Изменения сохранены" });
        const b = editBrand.trim(), a = editArticle.trim(), p = parseFloat(editPrice || "0") || 0;
        setActiveItems((prev) => prev.map((it) => it.id === addDialog.id ? { ...it, brand: b, article: a, price: p } : it));
        setAddDialog(null);
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleSaveTocatalog = async () => {
    if (!addDialog) return;
    if (!formName.trim()) {
      toast({ title: "Укажите название", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch(PRODUCTS_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: formName.trim(),
          article: addDialog.article,
          brand: addDialog.brand,
          category_id: formCategoryId || null,
          price_base: formPriceBase ? parseFloat(formPriceBase) : null,
          price_retail: formPriceRetail ? parseFloat(formPriceRetail) : null,
          price_wholesale: formPriceWholesale ? parseFloat(formPriceWholesale) : null,
          price_purchase: formPricePurchase ? parseFloat(formPricePurchase) : null,
          temp_product_id: addDialog.id,
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Товар добавлен в каталог" });
        removeActiveLocal(addDialog.id);
        setAddDialog(null);
        loadHistory();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const startDelete = (item: TempProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.usage_count === 0) {
      setSimpleDeleteItem(item);
      return;
    }
    setDeleteItem(item);
    setReplaceSearch("");
    setReplaceResults([]);
    setReplaceSelected(null);
    setUsedOrders([]);
    fetch(`${TEMP_PRODUCTS_URL}?action=orders&id=${item.id}`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => setUsedOrders(d.orders || []))
      .catch(() => { /* ignore */ });
  };

  const confirmSimpleDelete = async () => {
    if (!simpleDeleteItem) return;
    setDeleting(true);
    try {
      const resp = await fetch(`${TEMP_PRODUCTS_URL}?id=${simpleDeleteItem.id}`, { method: "DELETE", headers: authHeaders, body: "{}" });
      if (resp.ok) {
        toast({ title: "Товар удалён" });
        removeActiveLocal(simpleDeleteItem.id);
        setSimpleDeleteItem(null);
      } else {
        toast({ title: "Ошибка", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const openOrderView = async (orderId: number, itemName: string) => {
    setHighlightName(itemName.toLowerCase());
    setOrderLoading(true);
    setOrderView({ id: orderId, customer_name: "", comment: null, created_at: null, created_by: "", items: [] });
    try {
      const resp = await fetch(`${ORDERS_URL}?id=${orderId}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok && data.order) {
        setOrderView({
          id: data.order.id,
          customer_name: data.order.customer_name || "",
          comment: data.order.comment || null,
          created_at: data.order.created_at || null,
          created_by: data.order.created_by || "",
          items: data.order.items || [],
        });
      } else {
        toast({ title: "Не удалось открыть заявку", variant: "destructive" });
        setOrderView(null);
      }
    } catch {
      toast({ title: "Ошибка загрузки заявки", variant: "destructive" });
      setOrderView(null);
    } finally {
      setOrderLoading(false);
    }
  };

  const searchReplace = (value: string) => {
    setReplaceSearch(value);
    setReplaceSelected(null);
    if (replaceDebounceRef.current) clearTimeout(replaceDebounceRef.current);
    if (!value.trim() || value.trim().length < 2) { setReplaceResults([]); return; }
    replaceDebounceRef.current = setTimeout(async () => {
      try {
        const [prodResp, tempResp] = await Promise.all([
          fetch(`${PRODUCTS_URL}?search=${encodeURIComponent(value)}&per_page=8`, { headers: authHeaders }),
          fetch(`${TEMP_PRODUCTS_URL}?search=${encodeURIComponent(value)}&per_page=5`, { headers: authHeaders }),
        ]);
        const prodData = await prodResp.json();
        const tempData = await tempResp.json();
        const prodItems = (prodData.items || []).map((p: { id: number; name: string; article: string | null; brand: string | null; price_wholesale?: number | null }) => ({ ...p, is_temp: false }));
        const tempItems = (tempData.items || []).filter((t: TempProduct) => t.id !== deleteItem?.id).map((t: TempProduct) => ({ id: t.id, name: `${t.brand} ${t.article}`, article: t.article, brand: t.brand, price_wholesale: t.price, is_temp: true, temp_id: t.id }));
        setReplaceResults([...tempItems, ...prodItems]);
      } catch { /* ignore */ }
    }, 300);
  };

  const confirmDelete = async (keepPrice: boolean) => {
    if (!deleteItem || !replaceSelected) return;
    setDeleting(true);
    try {
      const resp = await fetch(`${TEMP_PRODUCTS_URL}?id=${deleteItem.id}`, {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({
          replace_product_id: replaceSelected.id,
          replace_temp_product_id: replaceSelected.temp_id,
          keep_price: keepPrice,
          replace_price: replaceSelected.price,
          replace_name: replaceSelected.name,
        }),
      });
      if (resp.ok) {
        toast({ title: "Товар заменён и удалён" });
        removeActiveLocal(deleteItem.id);
        setDeleteItem(null);
        setReplaceSelected(null);
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const filteredCats = categories.filter(c =>
    c.name.toLowerCase().includes(formCategory.toLowerCase())
  );

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ru-RU");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/dashboard")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Новые товары</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        <Tabs defaultValue="active">
          <TabsList className="w-full mb-4 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1">
            <TabsTrigger value="active" className="flex-1 rounded-lg text-sm data-[state=active]:bg-white/[0.1]">
              Активные ({activeTotal || activeItems.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 rounded-lg text-sm data-[state=active]:bg-white/[0.1]">
              История ({historyItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {loading ? (
              <div className="flex justify-center py-12">
                <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : activeItems.length === 0 ? (
              <div className="text-center py-12">
                <Icon name="PackageCheck" size={48} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Нет новых товаров</p>
              </div>
            ) : (
              <DebugBadge id="NewProducts:activeList">
              <div className="space-y-2">
                {activeItems.map((item) => (
                  <div key={item.id}>
                    <div
                      className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 hover:border-red-500/50 transition-colors cursor-pointer"
                      onClick={() => openAddDialog(item)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{item.brand} {item.article}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.price ? `${item.price.toLocaleString()} Br` : "—"} · {formatDate(item.created_at)}
                            {item.usage_count > 0 && <span className="ml-2 text-amber-400">в {item.usage_count} заявках</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors"
                            onClick={(e) => startDelete(item, e)}
                          >
                            <Icon name="Trash2" size={14} className="text-destructive" />
                          </button>
                          <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {activeItems.length < activeTotal && (
                <div className="flex flex-col items-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    className="rounded-lg border-white/[0.08]"
                    disabled={loadingMore}
                    onClick={loadMoreActive}
                  >
                    {loadingMore ? (
                      <Icon name="Loader2" size={16} className="animate-spin mr-1.5" />
                    ) : (
                      <Icon name="ChevronDown" size={16} className="mr-1.5" />
                    )}
                    Показать ещё
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Показано {activeItems.length} из {activeTotal}
                  </p>
                </div>
              )}
              </DebugBadge>
            )}
          </TabsContent>

          <TabsContent value="history">
            {loading ? (
              <div className="flex justify-center py-12">
                <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : historyItems.length === 0 ? (
              <div className="text-center py-12">
                <Icon name="History" size={48} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">История пуста</p>
              </div>
            ) : (
              <DebugBadge id="NewProducts:historyList">
                <div className="space-y-2">
                  {historyItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{item.brand} {item.article}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(item.created_at)}
                          </p>
                        </div>
                        <span className="text-xs text-green-400 flex-shrink-0">добавлен в каталог</span>
                      </div>
                    </div>
                  ))}
                </div>
              </DebugBadge>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!addDialog} onOpenChange={(o) => !o && setAddDialog(null)}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card max-w-md">
          <DialogHeader>
            <DialogTitle>{editMode ? "Редактировать товар" : "Добавить в каталог"}</DialogTitle>
          </DialogHeader>
          {addDialog && editMode && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Данные товара</p>
                <p className="text-xs text-muted-foreground"># {addDialog.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Бренд *</p>
                  <Input value={editBrand} onChange={(e) => setEditBrand(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Артикул *</p>
                  <Input value={editArticle} onChange={(e) => setEditArticle(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Цена</p>
                <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
              </div>
            </div>
          )}
          {addDialog && !editMode && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Название *</p>
                  <p className="text-xs text-muted-foreground"># {addDialog.id}</p>
                </div>
                <DebugBadge id="NewProducts:formName">
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="rounded-xl bg-secondary border-white/[0.08]"
                  />
                </DebugBadge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Бренд</p>
                  <Input value={addDialog.brand} readOnly className="rounded-xl bg-secondary border-white/[0.08] opacity-60" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Артикул</p>
                  <Input value={addDialog.article} readOnly className="rounded-xl bg-secondary border-white/[0.08] opacity-60" />
                </div>
              </div>
              <div className="relative">
                <p className="text-xs text-muted-foreground mb-1">Категория</p>
                <DebugBadge id="NewProducts:formCategory">
                  <Input
                    value={formCategory}
                    onChange={(e) => { setFormCategory(e.target.value); setFormCategoryId(null); setShowCatList(true); }}
                    onFocus={() => setShowCatList(true)}
                    placeholder="Выберите категорию..."
                    className="rounded-xl bg-secondary border-white/[0.08]"
                  />
                </DebugBadge>
                {showCatList && filteredCats.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-card overflow-hidden max-h-40 overflow-y-auto shadow-lg">
                    {filteredCats.slice(0, 20).map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0"
                        onClick={() => { setFormCategory(c.name); setFormCategoryId(c.id); setShowCatList(false); }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Цена базовая</p>
                  <DebugBadge id="NewProducts:priceBase">
                    <Input type="number" value={formPriceBase} onChange={(e) => setFormPriceBase(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                  </DebugBadge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Цена розничная</p>
                  <DebugBadge id="NewProducts:priceRetail">
                    <Input type="number" value={formPriceRetail} onChange={(e) => setFormPriceRetail(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                  </DebugBadge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Цена оптовая</p>
                  <DebugBadge id="NewProducts:priceWholesale">
                    <Input type="number" value={formPriceWholesale} onChange={(e) => setFormPriceWholesale(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                  </DebugBadge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Цена закупочная</p>
                  <DebugBadge id="NewProducts:pricePurchase">
                    <Input type="number" value={formPricePurchase} onChange={(e) => setFormPricePurchase(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                  </DebugBadge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" className="rounded-xl border-white/[0.08]" onClick={() => setAddDialog(null)}>
              Отмена
            </Button>
            {!editMode && (
              <Button variant="outline" className="rounded-xl border-white/[0.08]" onClick={() => setEditMode(true)}>
                <Icon name="Pencil" size={16} />
                <span className="ml-2">Редактировать</span>
              </Button>
            )}
            {editMode ? (
              <Button className="rounded-xl" onClick={handleSaveEdit} disabled={editSaving}>
                {editSaving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Save" size={16} />}
                <span className="ml-2">Сохранить изменения</span>
              </Button>
            ) : (
              <DebugBadge id="NewProducts:saveBtn">
                <Button className="rounded-xl" onClick={handleSaveTocatalog} disabled={saving}>
                  {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Check" size={16} />}
                  <span className="ml-2">Добавить в каталог</span>
                </Button>
              </DebugBadge>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteItem} onOpenChange={(o) => { if (!o) { setDeleteItem(null); setReplaceSelected(null); setUsedOrders([]); } }}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить товар</DialogTitle>
          </DialogHeader>
          {deleteItem && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-secondary">
                <p className="font-medium text-sm">{deleteItem.brand} {deleteItem.article}</p>
                <p className="text-xs text-amber-400 mt-1">
                  Используется в {deleteItem.usage_count} заявках — выберите замену
                </p>
              </div>
              {usedOrders.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Заявки с этим товаром:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {usedOrders.map((o) => (
                      <button
                        key={o.id}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs transition-colors flex items-center gap-1"
                        onClick={() => openOrderView(o.id, `${deleteItem.brand} ${deleteItem.article}`)}
                      >
                        <Icon name="FileText" size={12} className="text-muted-foreground" />
                        №{o.id}{o.customer_name ? ` · ${o.customer_name}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Товар для замены</p>
                <Input
                  placeholder="Поиск по бренду или артикулу..."
                  value={replaceSearch}
                  onChange={(e) => searchReplace(e.target.value)}
                  className="rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
              {replaceResults.length > 0 && !replaceSelected && (
                <div className="border border-white/[0.08] rounded-xl bg-card overflow-hidden max-h-52 overflow-y-auto">
                  {replaceResults.map((r) => (
                    <button
                      key={`${r.is_temp ? 'tp' : 'p'}-${r.id}`}
                      className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0"
                      onClick={() => setReplaceSelected({ id: r.is_temp ? null : r.id, temp_id: r.is_temp ? r.id : null, name: r.name, price: r.price_wholesale || 0 })}
                    >
                      <span>{r.name}</span>
                      {r.is_temp && <span className="text-amber-400 text-xs ml-1">временный</span>}
                      <span className="text-xs text-muted-foreground ml-2">{r.price_wholesale ? `${r.price_wholesale.toLocaleString()} Br` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {replaceSelected && (
                <div className="p-3 rounded-xl bg-white/[0.04]">
                  <p className="text-sm mb-1">Замена: <span className="font-medium">{replaceSelected.name}</span></p>
                  <p className="text-xs text-muted-foreground">
                    Текущая цена: {deleteItem.price.toLocaleString()} Br · Цена замены: {replaceSelected.price.toLocaleString()} Br
                  </p>
                  <button
                    className="text-xs text-muted-foreground underline mt-2"
                    onClick={() => setReplaceSelected(null)}
                  >
                    Выбрать другой товар
                  </button>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {replaceSelected ? (
              <>
                <Button className="rounded-xl" disabled={deleting} onClick={() => confirmDelete(true)}>
                  Оставить цену
                </Button>
                <Button variant="outline" className="rounded-xl border-white/[0.08]" disabled={deleting} onClick={() => confirmDelete(false)}>
                  Взять из товара
                </Button>
              </>
            ) : (
              <Button variant="ghost" className="rounded-xl" onClick={() => { setDeleteItem(null); setReplaceSelected(null); setUsedOrders([]); }}>
                Отменить
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!simpleDeleteItem} onOpenChange={(o) => { if (!o) setSimpleDeleteItem(null); }}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить товар</DialogTitle>
          </DialogHeader>
          {simpleDeleteItem && (
            <div className="p-3 rounded-xl bg-secondary">
              <p className="font-medium text-sm">{simpleDeleteItem.brand} {simpleDeleteItem.article}</p>
              <p className="text-xs text-muted-foreground mt-1">Товар будет удалён без возможности восстановления.</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => setSimpleDeleteItem(null)}>
              Отмена
            </Button>
            <Button variant="destructive" className="rounded-xl" disabled={deleting} onClick={confirmSimpleDelete}>
              {deleting ? <Icon name="Loader2" size={16} className="animate-spin mr-1.5" /> : <Icon name="Trash2" size={16} className="mr-1.5" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!orderView} onOpenChange={(o) => { if (!o) { setOrderView(null); setHighlightName(""); } }}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card max-w-md">
          <DialogHeader>
            <DialogTitle>Заявка №{orderView?.id}</DialogTitle>
          </DialogHeader>
          {orderLoading ? (
            <div className="flex justify-center py-8">
              <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : orderView && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-secondary space-y-1">
                <p className="text-sm"><span className="text-muted-foreground">Кому:</span> {orderView.customer_name || "—"}</p>
                <p className="text-sm"><span className="text-muted-foreground">Когда:</span> {formatDate(orderView.created_at)}</p>
                <p className="text-sm"><span className="text-muted-foreground">Создал:</span> {orderView.created_by || "—"}</p>
                {orderView.comment && (
                  <p className="text-sm"><span className="text-muted-foreground">Комментарий:</span> {orderView.comment}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Товары ({orderView.items.length})</p>
                <div className="border border-white/[0.08] rounded-xl bg-card overflow-hidden max-h-64 overflow-y-auto">
                  {orderView.items.map((it) => {
                    const isHighlight = highlightName && it.name.toLowerCase().includes(highlightName);
                    return (
                      <div
                        key={it.id}
                        className={`px-3 py-2 text-sm border-b border-white/[0.04] last:border-0 ${isHighlight ? "bg-amber-500/15" : ""}`}
                      >
                        <div className="flex justify-between gap-2">
                          <span className={isHighlight ? "font-medium text-amber-300" : ""}>{it.name}</span>
                          <span className="text-muted-foreground flex-shrink-0">{it.quantity} × {it.price.toLocaleString()} Br</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl border-white/[0.08]" onClick={() => { setOrderView(null); setHighlightName(""); }}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewProducts;