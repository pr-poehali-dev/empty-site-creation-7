import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";

interface GroupInfo {
  name: string;
  count: number;
}

const ProductGroups = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await fetch(`${PRODUCTS_URL}?distinct=product_group`, { headers: authHeaders });
        const data = await resp.json();
        if (resp.ok) {
          const names: string[] = data.groups || [];
          setGroups(names.map((n) => ({ name: n, count: 0 })));
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-white/[0.08] bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/catalog")}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold">Группы товаров</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="FolderTree" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Нет групп товаров</p>
            <p className="text-sm text-muted-foreground mt-1">Группы создаются при импорте из 1С</p>
          </div>
        ) : (
          <div className="space-y-1">
            {groups.map((g) => (
              <button
                key={g.name}
                className="w-full text-left rounded-xl border border-white/[0.08] bg-card p-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
                onClick={() => navigate(`/admin/catalog?group=${encodeURIComponent(g.name)}`)}
              >
                <Icon name="FolderTree" size={18} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium truncate">{g.name}</span>
              </button>
            ))}
            <p className="text-sm text-muted-foreground pt-2">{groups.length} {groups.length === 1 ? "группа" : "групп"}</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProductGroups;
