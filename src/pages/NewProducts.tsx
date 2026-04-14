import { useState, useEffect, useCallback } from "react";
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

const TEMP_PRODUCTS_URL = "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const CATEGORIES_URL = "https://functions.poehali.dev/2a93326d-2932-4f08-9867-b7d3f441d846";

interface TempProduct {
  id: number;
  brand: string;
  article: string;
  quantity: number;
  price: number;
  status: string;
  nomenclature_id: number | null;
  created_at: string | null;
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

  const [addDialog, setAddDialog] = useState<TempProduct | null>(null);
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [activeResp, histResp] = await Promise.all([
        fetch(`${TEMP_PRODUCTS_URL}?status=pending`, { headers: authHeaders }),
        fetch(`${TEMP_PRODUCTS_URL}?status=added&per_page=100`, { headers: authHeaders }),
      ]);
      const activeData = await activeResp.json();
      const histData = await histResp.json();
      if (activeResp.ok) setActiveItems(activeData.items || []);
      if (histResp.ok) setHistoryItems(histData.items || []);
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
    setFormName(`${item.brand} ${item.article}`);
    setFormCategory("");
    setFormCategoryId(null);
    setFormPriceBase("");
    setFormPriceRetail("");
    setFormPriceWholesale(String(item.price || ""));
    setFormPricePurchase("");
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
        setAddDialog(null);
        loadData();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSaving(false);
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
              Активные ({activeItems.length})
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
              <div className="space-y-2">
                {activeItems.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left rounded-xl border border-red-500/30 bg-red-950/20 p-3 hover:border-red-500/50 transition-colors"
                    onClick={() => openAddDialog(item)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{item.brand} {item.article}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.price ? `${item.price.toLocaleString()} ₽` : "—"} · {formatDate(item.created_at)}
                        </p>
                      </div>
                      <Icon name="ChevronRight" size={16} className="text-muted-foreground flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
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
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!addDialog} onOpenChange={(o) => !o && setAddDialog(null)}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить в каталог</DialogTitle>
          </DialogHeader>
          {addDialog && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Название *</p>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="rounded-xl bg-secondary border-white/[0.08]"
                />
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
                <Input
                  value={formCategory}
                  onChange={(e) => { setFormCategory(e.target.value); setFormCategoryId(null); setShowCatList(true); }}
                  onFocus={() => setShowCatList(true)}
                  placeholder="Выберите категорию..."
                  className="rounded-xl bg-secondary border-white/[0.08]"
                />
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
                  <Input type="number" value={formPriceBase} onChange={(e) => setFormPriceBase(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Цена розничная</p>
                  <Input type="number" value={formPriceRetail} onChange={(e) => setFormPriceRetail(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Цена оптовая</p>
                  <Input type="number" value={formPriceWholesale} onChange={(e) => setFormPriceWholesale(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Цена закупочная</p>
                  <Input type="number" value={formPricePurchase} onChange={(e) => setFormPricePurchase(e.target.value)} className="rounded-xl bg-secondary border-white/[0.08]" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl border-white/[0.08]" onClick={() => setAddDialog(null)}>
              Отмена
            </Button>
            <Button className="rounded-xl" onClick={handleSaveTocatalog} disabled={saving}>
              {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Check" size={16} />}
              <span className="ml-2">Добавить в каталог</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewProducts;
