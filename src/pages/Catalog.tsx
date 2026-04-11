import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const CATEGORIES_URL = "https://functions.poehali.dev/2a93326d-2932-4f08-9867-b7d3f441d846";
const NOMENCLATURE_URL = "https://functions.poehali.dev/b9921fd5-1333-471a-9ee5-86e701e904c6";

interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  sort_order: number;
}

interface NomImage {
  id: number;
  url: string;
  sort_order: number;
}

interface NomItem {
  id: number;
  category_id: number;
  name: string;
  article: string | null;
  brand: string | null;
  supplier_code: string | null;
  price_base: number | null;
  price_retail: number | null;
  price_wholesale: number | null;
  price_purchase: number | null;
  category_name: string;
  images: NomImage[];
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<NomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [showMobileCategories, setShowMobileCategories] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formArticle, setFormArticle] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formSupplierCode, setFormSupplierCode] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formPriceBase, setFormPriceBase] = useState("");
  const [formPriceRetail, setFormPriceRetail] = useState("");
  const [formPriceWholesale, setFormPriceWholesale] = useState("");
  const [formPricePurchase, setFormPricePurchase] = useState("");
  const [formImages, setFormImages] = useState<PendingImage[]>([]);
  const [saving, setSaving] = useState(false);

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

  const fetchItems = useCallback(async (categoryId: number | null, searchQuery?: string) => {
    setLoadingItems(true);
    try {
      const params = new URLSearchParams();
      if (categoryId) params.set("category_id", String(categoryId));
      if (searchQuery) params.set("search", searchQuery);
      const resp = await fetch(`${NOMENCLATURE_URL}?${params}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить номенклатуру", variant: "destructive" });
    } finally {
      setLoadingItems(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchItems(selectedCategory, search);
  }, [selectedCategory]);

  const handleSearch = () => {
    fetchItems(selectedCategory, search);
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

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setFormImages((prev) => [
          ...prev,
          { data: base64, content_type: file.type, preview: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFormImages((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFormName("");
    setFormArticle("");
    setFormBrand("");
    setFormSupplierCode("");
    setFormCategoryId("");
    setFormPriceBase("");
    setFormPriceRetail("");
    setFormPriceWholesale("");
    setFormPricePurchase("");
    setFormImages([]);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCategoryId) {
      toast({ title: "Ошибка", description: "Укажите название и категорию", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        category_id: Number(formCategoryId),
        article: formArticle.trim() || null,
        brand: formBrand.trim() || null,
        supplier_code: formSupplierCode.trim() || null,
        price_base: formPriceBase ? Number(formPriceBase) : null,
        price_retail: formPriceRetail ? Number(formPriceRetail) : null,
        price_wholesale: formPriceWholesale ? Number(formPriceWholesale) : null,
        images: formImages.map((img) => ({ data: img.data, content_type: img.content_type })),
      };
      if (isOwner) {
        payload.price_purchase = formPricePurchase ? Number(formPricePurchase) : null;
      }

      const resp = await fetch(NOMENCLATURE_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Товар добавлен" });
        setAddOpen(false);
        resetForm();
        fetchItems(selectedCategory, search);
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
            <h1 className="text-lg font-semibold">Каталог</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-9"
              onClick={() => {
                if (selectedCategory) setFormCategoryId(String(selectedCategory));
                setAddOpen(true);
              }}
            >
              <Icon name="Plus" size={16} />
              <span className="ml-1 hidden sm:inline">Добавить товар</span>
              <span className="ml-1 sm:hidden">Добавить</span>
            </Button>
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

          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              {selectedCategoryName} · {total} {total === 1 ? "позиция" : "позиций"}
            </p>
          </div>

          {loadingItems ? (
            <div className="flex justify-center py-12">
              <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="Package" size={48} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Нет номенклатуры</p>
              <p className="text-sm text-muted-foreground mt-1">Нажмите «Добавить товар» для создания</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/[0.08] bg-card p-3 sm:p-4 flex gap-3"
                >
                  {item.images.length > 0 ? (
                    <img
                      src={item.images[0].url}
                      alt={item.name}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                      <Icon name="Image" size={20} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm sm:text-base truncate">{item.name}</p>
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
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Add nomenclature dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); resetForm(); } }}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Добавить товар</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Название *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Холодильник Samsung RB37"
                className="h-10 rounded-xl bg-secondary border-white/[0.08]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Артикул</label>
                <Input
                  value={formArticle}
                  onChange={(e) => setFormArticle(e.target.value)}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Бренд</label>
                <Input
                  value={formBrand}
                  onChange={(e) => setFormBrand(e.target.value)}
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
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Категория *</label>
                <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                  <SelectTrigger className="h-10 rounded-xl bg-secondary border-white/[0.08]">
                    <SelectValue placeholder="Выберите" />
                  </SelectTrigger>
                  <SelectContent>
                    {getLeafCategories().map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Цены</label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  placeholder="Базовая"
                  value={formPriceBase}
                  onChange={(e) => setFormPriceBase(e.target.value)}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
                <Input
                  type="number"
                  placeholder="Розничная"
                  value={formPriceRetail}
                  onChange={(e) => setFormPriceRetail(e.target.value)}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
                <Input
                  type="number"
                  placeholder="Оптовая"
                  value={formPriceWholesale}
                  onChange={(e) => setFormPriceWholesale(e.target.value)}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
                {isOwner && (
                  <Input
                    type="number"
                    placeholder="Закупочная"
                    value={formPricePurchase}
                    onChange={(e) => setFormPricePurchase(e.target.value)}
                    className="h-10 rounded-xl bg-secondary border-yellow-500/30"
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Фотографии</label>
              <div className="flex gap-2 flex-wrap">
                {formImages.map((img, i) => (
                  <div key={i} className="relative w-16 h-16">
                    <img src={img.preview} alt="" className="w-16 h-16 rounded-lg object-cover" />
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              {saving ? (
                <Icon name="Loader2" size={18} className="animate-spin" />
              ) : (
                <Icon name="Check" size={18} />
              )}
              <span className="ml-2">{saving ? "Сохранение..." : "Сохранить"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Catalog;