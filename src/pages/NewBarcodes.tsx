import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const NEW_BARCODES_URL = "https://functions.poehali.dev/753c16bb-172a-460b-a7b4-2ffc3c26b6f7";

interface NewBarcode {
  id: number;
  barcode: string;
  nomenclature_id: number | null;
  product_name: string | null;
  product_article: string | null;
  confirmed: boolean;
  is_removed: boolean;
  created_at: string | null;
}

const NewBarcodes = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [activeItems, setActiveItems] = useState<NewBarcode[]>([]);
  const [historyItems, setHistoryItems] = useState<NewBarcode[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [activeResp, histResp] = await Promise.all([
        fetch(`${NEW_BARCODES_URL}?removed=0`, { headers: authHeaders }),
        fetch(`${NEW_BARCODES_URL}?removed=1`, { headers: authHeaders }),
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

  useEffect(() => {
    loadData();
  }, []);

  const removeBarcode = async (id: number) => {
    try {
      const resp = await fetch(`${NEW_BARCODES_URL}?id=${id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ is_removed: true }),
      });
      if (resp.ok) {
        toast({ title: "Штрихкод удалён" });
        loadData();
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  const confirmBarcode = async (id: number) => {
    try {
      const resp = await fetch(`${NEW_BARCODES_URL}?id=${id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ confirmed: true }),
      });
      if (resp.ok) {
        toast({ title: "Штрихкод подтверждён" });
        loadData();
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ru-RU");
  };

  const renderItem = (item: NewBarcode, showActions: boolean) => (
    <div
      key={item.id}
      className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-medium">{item.barcode}</p>
          {item.product_name ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.product_name}
              {item.product_article && ` · ${item.product_article}`}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Товар не привязан</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(item.created_at)}</p>
        </div>
        {showActions && (
          <div className="flex gap-1.5 flex-shrink-0">
            {!item.confirmed && item.nomenclature_id && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-lg text-xs border-green-500/30 text-green-400 hover:text-green-300 px-2"
                onClick={() => confirmBarcode(item.id)}
              >
                <Icon name="Check" size={12} />
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-lg text-xs border-red-500/30 text-red-400 hover:text-red-300 px-2"
              onClick={() => removeBarcode(item.id)}
            >
              <Icon name="Trash2" size={12} />
            </Button>
          </div>
        )}
        {!showActions && (
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {item.is_removed ? "удалён" : item.confirmed ? "подтверждён" : "—"}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/dashboard")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Новые штрихкоды</h1>
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
                <Icon name="ScanLine" size={48} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Нет новых штрихкодов</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeItems.map((item) => renderItem(item, true))}
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
                {historyItems.map((item) => renderItem(item, false))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default NewBarcodes;
