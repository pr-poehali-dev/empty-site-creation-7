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
import DebugBadge from "@/components/DebugBadge";

const RETURNS_URL = "https://functions.poehali.dev/57193003-9226-4238-83dd-4f87ff8cd5ad";

interface ReturnItem {
  id: number;
  customer_name: string;
  comment: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  accepted_at: string | null;
  created_by: string;
  used_amount?: number;
  remaining_amount?: number;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: "Черновик", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  confirmed: { label: "Подтверждён", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  accepted: { label: "Принят", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  archived: { label: "Архив", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

const WholesaleReturns = () => {
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

  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReturnItem | null>(null);

  const fetchReturns = useCallback(async (archived = false) => {
    setLoading(true);
    try {
      const url = archived ? `${RETURNS_URL}?include_archived=1` : RETURNS_URL;
      const resp = await fetch(url, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setReturns(data.returns || []);
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить возвраты", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchReturns();
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const isArchived = deleteTarget.status === "archived";
    try {
      const resp = isArchived
        ? await fetch(`${RETURNS_URL}?id=${deleteTarget.id}`, {
            method: "DELETE",
            headers: authHeaders,
          })
        : await fetch(`${RETURNS_URL}?id=${deleteTarget.id}`, {
            method: "PUT",
            headers: authHeaders,
            body: JSON.stringify({ status: "archived" }),
          });
      if (resp.ok) {
        toast({ title: isArchived ? "Возврат удалён" : "Возврат в архиве" });
        setDeleteTarget(null);
        fetchReturns(showArchive);
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
    fetchReturns(next);
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
            <h1 className="text-lg font-semibold">Возвраты</h1>
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
              <DebugBadge id="Returns:createBtn">
                <Button className="h-9" onClick={() => navigate("/admin/returns/create")}>
                  <Icon name="Plus" size={16} />
                  <span className="ml-1 hidden sm:inline">Создать возврат</span>
                  <span className="ml-1 sm:hidden">Создать</span>
                </Button>
              </DebugBadge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : returns.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="Undo2" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">{showArchive ? "Нет архивных возвратов" : "Возвратов пока нет"}</p>
            {canCreate && !showArchive && (
              <p className="text-sm text-muted-foreground mt-1">Нажмите «Создать возврат» для начала</p>
            )}
          </div>
        ) : (
          <DebugBadge id="Returns:list">
            <div className="space-y-2">
              {returns.map((r) => {
                const st = statusLabels[r.status] || statusLabels.draft;
                return (
                  <div
                    key={r.id}
                    className="rounded-xl p-3 sm:p-4 cursor-pointer hover:bg-white/[0.02] transition-colors border bg-card border-white/[0.08]"
                    onClick={() => navigate(`/admin/returns/${r.id}/edit`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground font-mono flex-shrink-0">#{r.id}</span>
                          <p className="font-medium text-sm sm:text-base">{r.customer_name}</p>
                          <Badge className={`${st.className} text-xs`}>{st.label}</Badge>
                        </div>
                        {r.comment && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{r.comment}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(r.created_at)} · {r.created_by}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-sm sm:text-base">{r.total_amount.toLocaleString()} Br</p>
                        {r.status === "accepted" && r.remaining_amount !== undefined && (
                          <p className={`text-xs mt-0.5 ${
                            r.remaining_amount > 0 ? "text-emerald-400" : "text-muted-foreground"
                          }`}>
                            {r.remaining_amount > 0
                              ? `Остаток: ${r.remaining_amount.toLocaleString()} Br`
                              : "Зачтён полностью"}
                          </p>
                        )}
                        {isOwner && (
                          <button
                            className="mt-2 w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(r);
                            }}
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
          </DebugBadge>
        )}
      </main>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.status === "archived" ? "Удалить возврат?" : "Архивировать возврат?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.status === "archived"
                ? "Возврат будет удалён безвозвратно."
                : "Возврат будет перемещён в архив."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WholesaleReturns;