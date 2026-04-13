import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const WHOLESALERS_URL = "https://functions.poehali.dev/03df983f-e7e9-4cd5-9427-e61b88d1171f";

interface Wholesaler {
  id: number;
  name: string;
}

const PricingRules = () => {
  const navigate = useNavigate();
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    fetch(WHOLESALERS_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setWholesalers(d.items || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/dashboard")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Определение цен</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        <p className="text-sm text-muted-foreground mb-4">Выберите оптовика для настройки ценообразования</p>
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
        ) : wholesalers.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="Users" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Оптовиков пока нет</p>
          </div>
        ) : (
          <div className="space-y-2">
            {wholesalers.map((w) => (
              <button
                key={w.id}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-white/[0.08] bg-card hover:bg-white/[0.04] transition-colors text-left"
                onClick={() => navigate(`/admin/pricing/${w.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Icon name="User" size={18} className="text-primary" />
                  </div>
                  <span className="font-medium">{w.name}</span>
                </div>
                <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PricingRules;
