import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import {
  callSearchDicts,
  loadSearchDicts,
  PARSE_STATUS_COLORS,
  PARSE_STATUS_LABELS,
  ParseStatus,
  SearchBrand,
  SearchGroup,
} from "@/components/search-dicts/api";
import DictList from "@/components/search-dicts/DictList";
import ParsePreview from "@/components/search-dicts/ParsePreview";

const SearchDicts = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const [tab, setTab] = useState<"brands" | "groups">("brands");
  const [brands, setBrands] = useState<SearchBrand[]>([]);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [parseBrandId, setParseBrandId] = useState<number | null>(null);

  const load = async () => {
    try {
      const d = await loadSearchDicts();
      setBrands(d.brands);
      setGroups(d.groups);
      setStats(d.stats);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin/dashboard");
      return;
    }
    load();
  }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ title: ok });
      await load();
      return true;
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      return false;
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/dashboard")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Справочники для поиска</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {parseBrandId !== null ? (
          <ParsePreview
            brandId={parseBrandId}
            onClose={() => setParseBrandId(null)}
            onApplied={() => { setParseBrandId(null); load(); }}
          />
        ) : (
        <>
        <div className="rounded-xl border border-white/[0.08] p-4">
          <p className="text-sm font-medium mb-2">Разбор каталога</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PARSE_STATUS_LABELS) as ParseStatus[]).map((s) => (
              <Badge key={s} className={PARSE_STATUS_COLORS[s]}>
                {PARSE_STATUS_LABELS[s]}: {(stats[s] || 0).toLocaleString("ru-RU")}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Считаются только товары не из архива. Справочники и поля видны только владельцу.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant={tab === "brands" ? "default" : "outline"} className="rounded-xl" onClick={() => setTab("brands")}>
            Бренды для поиска ({brands.length})
          </Button>
          <Button variant={tab === "groups" ? "default" : "outline"} className="rounded-xl" onClick={() => setTab("groups")}>
            Товарные группы ({groups.length})
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : tab === "brands" ? (
          <DictList
            key="brands"
            items={brands}
            withAliases
            onParse={(id) => setParseBrandId(id)}
            emptyText="Брендов пока нет"
            onCreate={(name, aliases) => run(() => callSearchDicts("POST", "section=brands", { name, aliases }), "Бренд добавлен")}
            onUpdate={(id, name, aliases) => run(() => callSearchDicts("PUT", `section=brands&id=${id}`, { name, aliases }), "Сохранено")}
            onDelete={(id) => run(() => callSearchDicts("DELETE", `section=brands&id=${id}`), "Бренд удалён")}
          />
        ) : (
          <DictList
            key="groups"
            items={groups}
            emptyText="Групп пока нет — они появятся при разборе каталога"
            onCreate={(name) => run(() => callSearchDicts("POST", "section=groups", { name }), "Группа добавлена")}
            onUpdate={(id, name) => run(() => callSearchDicts("PUT", `section=groups&id=${id}`, { name }), "Сохранено")}
            onDelete={(id) => run(() => callSearchDicts("DELETE", `section=groups&id=${id}`), "Группа удалена")}
          />
        )}
        </>
        )}
      </main>
    </div>
  );
};

export default SearchDicts;