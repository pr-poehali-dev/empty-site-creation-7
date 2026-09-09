import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import * as api from "./inventoryApi";
import { InventoryListItem, WholesalerOption } from "./types";

const InventoriesListPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [firms, setFirms] = useState<WholesalerOption[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showFirmPicker, setShowFirmPicker] = useState(false);

  const load = async () => {
    try {
      const data = await api.fetchInventories();
      setItems(data.inventories);
      setFirms(data.wholesalers);
      setIsOwner(data.is_owner);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (wholesalerId: number) => {
    setCreating(true);
    try {
      const r = await api.createInventory(wholesalerId);
      navigate(`${basePath}/${r.id}`);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
      setShowFirmPicker(false);
    }
  };

  const basePath = isOwner ? "/admin/inventories" : "/wholesaler/inventories";

  const handleCreateClick = () => {
    if (firms.length === 0) {
      toast({ title: "Нет доступных фирм", variant: "destructive" });
      return;
    }
    if (firms.length === 1) {
      create(firms[0].id);
      return;
    }
    setShowFirmPicker(true);
  };

  const remove = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Удалить инвентаризацию?")) return;
    try {
      await api.deleteInventory(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-2 mb-4">
          <button
            className="w-9 h-9 rounded-xl border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.06]"
            onClick={() => navigate(isOwner ? "/admin" : "/wholesaler")}
          >
            <Icon name="ArrowLeft" size={16} />
          </button>
          <h1 className="text-lg font-semibold flex-1">Инвентаризации</h1>
        </div>

        <Button className="w-full h-11 rounded-xl mb-4" onClick={handleCreateClick} disabled={creating}>
          {creating ? (
            <Icon name="Loader2" size={16} className="animate-spin" />
          ) : (
            <Icon name="Plus" size={16} />
          )}
          <span className="ml-2">Новая инвентаризация</span>
        </Button>

        {showFirmPicker && (
          <div className="mb-4 border border-white/[0.08] rounded-xl overflow-hidden">
            <p className="px-3 py-2 text-xs text-muted-foreground bg-white/[0.02]">Выберите фирму</p>
            {firms.map((f) => (
              <button
                key={f.id}
                className="w-full text-left px-3 py-2.5 hover:bg-white/[0.06] text-sm border-t border-white/[0.04]"
                onClick={() => create(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="ClipboardList" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Инвентаризаций пока нет</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((inv) => (
              <div
                key={inv.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
                onClick={() => navigate(`${basePath}/${inv.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      №{inv.id} · {inv.wholesaler_name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.items_count} поз. ·{" "}
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString("ru-RU") : ""}
                    </p>
                    {inv.comment && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{inv.comment}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold">
                      {inv.total_amount.toLocaleString()} Br
                    </span>
                    {isOwner && (
                      <button
                        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20"
                        onClick={(e) => remove(e, inv.id)}
                      >
                        <Icon name="Trash2" size={14} className="text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoriesListPage;
