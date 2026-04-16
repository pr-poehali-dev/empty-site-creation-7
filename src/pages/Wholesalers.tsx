import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import DebugBadge from "@/components/DebugBadge";

const WHOLESALERS_URL = "https://functions.poehali.dev/03df983f-e7e9-4cd5-9427-e61b88d1171f";

interface Wholesaler {
  id: number;
  name: string;
}

const Wholesalers = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const [items, setItems] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await fetch(WHOLESALERS_URL, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        if (resp.ok) setItems(data.items || []);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/dashboard")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Оптовики</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="Users" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Оптовики появятся автоматически из заявок</p>
          </div>
        ) : (
          <DebugBadge id="Wholesalers:list">
            <div className="space-y-2">
              {items.map((w) => (
                <div key={w.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{w.name}</p>
                  </div>
                  <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
                </div>
              ))}
            </div>
          </DebugBadge>
        )}
      </main>
    </div>
  );
};

export default Wholesalers;