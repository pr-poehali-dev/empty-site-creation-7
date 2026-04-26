import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";

interface ProductImage {
  id: number;
  url: string;
  thumbnail_url?: string;
  sort_order: number;
}

interface Product {
  id: number;
  name: string;
  article: string | null;
  brand: string | null;
  category_name: string | null;
  price_wholesale: number | null;
  is_new: boolean;
  images: ProductImage[];
}

const CatalogNewProducts = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${PRODUCTS_URL}?is_new=true&per_page=200`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        setItems(data.items || []);
        setTotal(data.total || 0);
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/catalog")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <Icon name="Sparkles" size={18} className="text-primary" />
            <h1 className="text-lg font-semibold">Новые в каталоге</h1>
            {total > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">{total}</span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Icon name="Loader2" size={20} className="animate-spin mr-2" />
            Загрузка…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Icon name="PackageOpen" size={40} className="mb-2 opacity-50" />
            <p>Пока нет товаров, добавленных в каталог из «Новых товаров».</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const thumb = item.images?.[0]?.thumbnail_url || item.images?.[0]?.url;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`/admin/catalog?product=${item.id}`)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-white/[0.08] bg-card hover:bg-white/[0.04] transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icon name="Image" size={18} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[item.brand, item.article].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  {item.price_wholesale != null && (
                    <div className="text-sm font-semibold flex-shrink-0">
                      {item.price_wholesale.toLocaleString("ru-RU")} ₽
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default CatalogNewProducts;
