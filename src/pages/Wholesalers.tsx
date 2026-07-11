import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Icon from "@/components/ui/icon";
import DebugBadge from "@/components/DebugBadge";

const WHOLESALERS_URL = "https://functions.poehali.dev/03df983f-e7e9-4cd5-9427-e61b88d1171f";

interface Wholesaler {
  id: number;
  name: string;
  orders_count: number;
  returns_count: number;
}

const Wholesalers = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = localStorage.getItem("auth_token") || "";
  const [items, setItems] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<Wholesaler | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await fetch(`${WHOLESALERS_URL}?withStats=1`, {
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

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const resp = await fetch(`${WHOLESALERS_URL}?id=${toDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        setItems((prev) => prev.filter((x) => x.id !== toDelete.id));
        toast({ title: "Оптовик удалён", description: toDelete.name });
        setToDelete(null);
      } else {
        toast({
          title: "Не удалось удалить",
          description: data.error || "Попробуйте ещё раз",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (w: Wholesaler) => {
    setEditingId(w.id);
    setEditName(w.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (w: Wholesaler) => {
    const name = editName.trim();
    if (!name) {
      toast({ title: "Введите название", variant: "destructive" });
      return;
    }
    if (name === w.name) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    try {
      const resp = await fetch(`${WHOLESALERS_URL}?id=${w.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        setItems((prev) => prev.map((x) => (x.id === w.id ? { ...x, name } : x)));
        toast({ title: "Название изменено", description: name });
        cancelEdit();
      } else {
        toast({ title: "Не удалось сохранить", description: data.error || "Попробуйте ещё раз", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

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
              {items.map((w) => {
                const used = w.orders_count > 0 || w.returns_count > 0;
                return (
                  <div
                    key={w.id}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 flex items-center justify-between gap-2"
                  >
                    {editingId === w.id ? (
                      <>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          disabled={savingEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(w);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="h-9 flex-1 min-w-0"
                        />
                        <button
                          type="button"
                          onClick={() => saveEdit(w)}
                          disabled={savingEdit}
                          title="Сохранить"
                          className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-green-400 hover:bg-green-500/10 disabled:opacity-40 transition-colors"
                        >
                          <Icon name={savingEdit ? "Loader2" : "Check"} size={16} className={savingEdit ? "animate-spin" : ""} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                          title="Отмена"
                          className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
                        >
                          <Icon name="X" size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{w.name}</p>
                          {used && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {w.orders_count > 0 && <span>{w.orders_count} заявок</span>}
                              {w.orders_count > 0 && w.returns_count > 0 && <span> · </span>}
                              {w.returns_count > 0 && <span>{w.returns_count} возвратов</span>}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(w)}
                          title="Изменить название"
                          className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Icon name="Pencil" size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => !used && setToDelete(w)}
                          disabled={used}
                          title={used ? "Оптовик участвует в заявках или возвратах" : "Удалить оптовика"}
                          className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                        >
                          <Icon name="Trash2" size={16} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </DebugBadge>
        )}
      </main>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить оптовика?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              Оптовик «{toDelete?.name}» будет удалён. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Удаляю…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Wholesalers;