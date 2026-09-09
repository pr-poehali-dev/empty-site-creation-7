import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import * as api from "./inventoryApi";

interface Props {
  inventoryId: number;
  onClose: () => void;
}

const InventoryVisibilityDialog = ({ inventoryId, onClose }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [managers, setManagers] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    api
      .getVisibility(inventoryId)
      .then((r) => {
        setManagers(r.managers);
        setSelected(new Set(r.shared_manager_ids));
      })
      .catch((e) => toast({ title: (e as Error).message, variant: "destructive" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryId]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.setVisibility(inventoryId, Array.from(selected));
      toast({ title: "Настройки сохранены" });
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Кому видна инвентаризация</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {managers.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Нет сотрудников для выбора
              </p>
            )}
            {managers.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.04] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="w-4 h-4 rounded border-white/20 bg-white/[0.04]"
                />
                <span className="text-sm">{m.name}</span>
                <span className="text-[10px] text-blue-400 ml-auto">id={m.id}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button className="flex-1 rounded-xl" onClick={save} disabled={saving || loading}>
            {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Check" size={16} />}
            <span className="ml-2">Сохранить</span>
          </Button>
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryVisibilityDialog;
