import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";

interface Order {
  id: number;
  customer_name: string;
  comment: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  created_by: string;
  payment_status: string;
  paid_amount: number;
  is_restored: boolean;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  new: { label: "Новая", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  confirmed: { label: "Подтверждена", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  shipped: { label: "Отгружена", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  completed: { label: "Завершена", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  archived: { label: "Архив", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

const paymentStatusLabels: Record<string, { label: string; className: string }> = {
  not_paid: { label: "Не оплачена", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  partially_paid: { label: "Частично", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  paid: { label: "Оплачена", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

const WholesaleOrders = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();
  const isOwner = user.role === "owner";
  const canCreate = !isOwner;

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  const fetchOrders = useCallback(async (archived = false) => {
    setLoading(true);
    try {
      const url = archived ? `${ORDERS_URL}?include_archived=1` : ORDERS_URL;
      const resp = await fetch(url, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setOrders(data.orders || []);
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить заявки", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOrders();
    localStorage.removeItem("draft_order");
    localStorage.removeItem("draft_order_items");
    localStorage.removeItem("draft_order_returning");
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const isArchived = deleteTarget.status === "archived";
    try {
      const resp = isArchived
        ? await fetch(`${ORDERS_URL}?id=${deleteTarget.id}`, {
            method: "DELETE",
            headers: authHeaders,
          })
        : await fetch(`${ORDERS_URL}?id=${deleteTarget.id}`, {
            method: "PUT",
            headers: authHeaders,
            body: JSON.stringify({ status: "archived" }),
          });
      if (resp.ok) {
        toast({ title: isArchived ? "Заявка удалена" : "Заявка в архиве" });
        setDeleteTarget(null);
        setViewOrder(null);
        fetchOrders(showArchive);
      } else {
        const data = await resp.json();
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" });
    }
  };

  const toggleArchive = () => {
    const next = !showArchive;
    setShowArchive(next);
    fetchOrders(next);
  };

  const goBack = () => {
    if (isOwner) navigate("/admin/dashboard");
    else navigate("/admin/manager");
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goBack}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold">Заявки</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                showArchive
                  ? "bg-primary/20 text-primary"
                  : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
              }`}
              onClick={toggleArchive}
            >
              <Icon name="Archive" size={14} className="inline mr-1" />
              Архив
            </button>
            {canCreate && (
              <Button className="h-9" onClick={() => navigate("/admin/orders/create")}>
                <Icon name="Plus" size={16} />
                <span className="ml-1 hidden sm:inline">Создать заявку</span>
                <span className="ml-1 sm:hidden">Создать</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="ClipboardList" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">{showArchive ? "Нет архивных заявок" : "Заявок пока нет"}</p>
            {canCreate && !showArchive && (
              <p className="text-sm text-muted-foreground mt-1">Нажмите «Создать заявку» для начала</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const st = statusLabels[order.status] || statusLabels.new;
              const ps = paymentStatusLabels[order.payment_status] || paymentStatusLabels.not_paid;
              const isCompleted = order.status === "completed";
              return (
                <div
                  key={order.id}
                  className={`rounded-xl border p-3 sm:p-4 cursor-pointer hover:bg-white/[0.02] transition-colors ${
                    order.is_restored
                      ? "bg-purple-500/5 border-purple-500/15"
                      : "bg-card border-white/[0.08]"
                  }`}
                  onClick={() => navigate(`/admin/orders/${order.id}/edit`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono flex-shrink-0">#{order.id}</span>
                        <p className="font-medium text-sm sm:text-base">{order.customer_name}</p>
                        {isCompleted ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Завершена</Badge>
                        ) : (
                          <>
                            <Badge className={`${st.className} text-xs`}>{st.label}</Badge>
                            <Badge className={`${ps.className} text-xs`}>{ps.label}</Badge>
                          </>
                        )}
                      </div>
                      {order.comment && (
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">{order.comment}</p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.created_at)} · {order.created_by}
                        </p>
                        {order.is_restored && (
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] py-0 px-1.5 leading-4">Из архива</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-sm sm:text-base font-semibold">
                        {order.total_amount.toLocaleString()} ₽
                      </p>
                      {isOwner && (
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(order); }}
                        >
                          <Icon name="Trash2" size={14} className="text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить заявку?</AlertDialogTitle>
            <AlertDialogDescription>
              Заявка «{deleteTarget?.customer_name}» на сумму {deleteTarget?.total_amount.toLocaleString()} ₽ будет удалена безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WholesaleOrders;