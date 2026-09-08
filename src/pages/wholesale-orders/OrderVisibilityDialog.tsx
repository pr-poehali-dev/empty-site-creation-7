import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { orderApi, VisibilityManager } from "./orderApi";

interface Props {
  orderId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const OrderVisibilityDialog = ({ orderId, open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleAll, setVisibleAll] = useState(false);
  const [managers, setManagers] = useState<VisibilityManager[]>([]);
  const [wholesalerUsers, setWholesalerUsers] = useState<VisibilityManager[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    orderApi
      .getVisibility(orderId)
      .then((data) => {
        if (cancelled) return;
        setVisibleAll(data.visibility === "all");
        setManagers(data.managers || []);
        const firmUsers = data.wholesaler_users || [];
        setWholesalerUsers(firmUsers);

        const shared = new Set(data.shared_manager_ids || []);
        // Оптовики своей фирмы по умолчанию видят заявку: при первой настройке
        // отмечаем их сразу, снять галочку менеджер может вручную.
        const noneChosenYet = firmUsers.length > 0 && !firmUsers.some((u) => shared.has(u.id));
        if (noneChosenYet && (data.shared_manager_ids || []).length === 0) {
          firmUsers.forEach((u) => shared.add(u.id));
        }
        setSelected(shared);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "Не удалось загрузить настройки");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const toggleManager = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const firmIds = new Set(wholesalerUsers.map((u) => u.id));
      // «Показать всем» касается только менеджеров — доступ оптовиков
      // всегда поимённый, поэтому их отметки сохраняем в любом случае.
      const ids = visibleAll
        ? Array.from(selected).filter((id) => firmIds.has(id))
        : Array.from(selected);
      await orderApi.setVisibility(orderId, visibleAll ? "all" : "private", ids);
      toast({ title: "Настройки видимости сохранены" });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Ошибка",
        description: (e as Error)?.message || "Не удалось сохранить",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Видимость заявки</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Icon name="Loader2" size={20} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              По умолчанию заявку видите только вы и владелец. Здесь можно открыть
              доступ другим менеджерам.
            </p>

            <div className="flex items-center justify-between rounded-lg border border-white/[0.08] px-3 py-3">
              <div>
                <div className="font-medium">Показать всем менеджерам</div>
                <div className="text-xs text-muted-foreground">
                  Заявку увидят все менеджеры. На оптовиков не влияет
                </div>
              </div>
              <Switch checked={visibleAll} onCheckedChange={setVisibleAll} />
            </div>

            {!visibleAll && (
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  Или выберите конкретных менеджеров:
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-white/[0.08] divide-y divide-white/[0.06]">
                  {managers.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground">
                      Нет других менеджеров
                    </div>
                  ) : (
                    managers.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03]"
                      >
                        <Checkbox
                          checked={selected.has(m.id)}
                          onCheckedChange={() => toggleManager(m.id)}
                        />
                        <span className="text-sm">{m.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {wholesalerUsers.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                <div className="text-sm font-medium">Оптовики фирмы из заявки</div>
                <p className="text-xs text-muted-foreground">
                  Показаны только оптовики, связанные с фирмой этой заявки
                </p>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-white/[0.08] divide-y divide-white/[0.06]">
                  {wholesalerUsers.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03]"
                    >
                      <Checkbox
                        checked={selected.has(u.id)}
                        onCheckedChange={() => toggleManager(u.id)}
                      />
                      <span className="text-sm">{u.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={loading || saving || !!error}>
            {saving ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              "Сохранить"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderVisibilityDialog;