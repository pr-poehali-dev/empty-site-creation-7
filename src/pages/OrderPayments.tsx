import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import DebugBadge from "@/components/DebugBadge";

const PAYMENTS_URL = "https://functions.poehali.dev/e4dc8d0d-913c-40e0-84e8-2bd0c73c1d1c";

const METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card_transfer: "Перевод на карту",
  bank_account: "На р/с",
  return_offset: "Зачёт возврата",
};

const PAYMENT_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  not_paid: { label: "Не оплачена", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  partially_paid: { label: "Частично оплачена", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  paid: { label: "Оплачена", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

interface Payment {
  id: number;
  amount: number;
  method: string;
  comment: string | null;
  created_at: string;
}

const OrderPayments = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState("not_paid");
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [returnBalance, setReturnBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${PAYMENTS_URL}?order_id=${orderId}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        setPayments(data.payments || []);
        setTotalAmount(data.total_amount || 0);
        setPaidAmount(data.paid_amount || 0);
        setPaymentStatus(data.payment_status || "not_paid");
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить платежи", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchReturnBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const resp = await fetch(`${PAYMENTS_URL}?order_id=${orderId}&action=return_balance`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setReturnBalance(data.balance || 0);
    } catch {
      setReturnBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  }, [orderId, token]);

  const handleMethodChange = (newMethod: string) => {
    setMethod(newMethod);
    if (newMethod === "return_offset") {
      fetchReturnBalance().then(() => {
        // Автозаполнение: min(остаток к оплате заявки, доступный зачёт)
        // используем актуальный balance после fetch — берём из state в следующем тике через useEffect ниже
      });
    }
  };

  // Автозаполнение суммы при изменении баланса/выборе метода return_offset
  useEffect(() => {
    if (method === "return_offset" && !balanceLoading) {
      const auto = Math.min(returnBalance, remaining);
      setAmount(auto > 0 ? String(auto) : "0");
    }
  }, [method, returnBalance, balanceLoading]);

  const handleAdd = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast({ title: "Ошибка", description: "Укажите сумму", variant: "destructive" });
      return;
    }
    if (!method) {
      toast({ title: "Ошибка", description: "Выберите способ оплаты", variant: "destructive" });
      return;
    }
    if (method === "return_offset") {
      if (returnBalance <= 0) {
        toast({ title: "Ошибка", description: "Нет доступной суммы зачёта по этому оптовику", variant: "destructive" });
        return;
      }
      if (numAmount > returnBalance + 0.001) {
        toast({
          title: "Ошибка",
          description: `Сумма превышает доступный остаток зачёта (${returnBalance.toLocaleString()} Br)`,
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    try {
      const resp = await fetch(`${PAYMENTS_URL}?order_id=${orderId}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ amount: numAmount, method, comment: comment.trim() || null }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Оплата добавлена" });
        setDialogOpen(false);
        setMethod("");
        setAmount("");
        setComment("");
        setReturnBalance(0);
        fetchPayments();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось добавить оплату", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const resp = await fetch(`${PAYMENTS_URL}?order_id=${orderId}&payment_id=${deleteId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (resp.ok) {
        toast({ title: "Платёж удалён" });
        setDeleteId(null);
        fetchPayments();
      } else {
        const data = await resp.json();
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const pct = totalAmount > 0 ? Math.min(100, Math.round((paidAmount / totalAmount) * 100)) : 0;
  const remaining = Math.max(0, totalAmount - paidAmount);
  const statusBadge = PAYMENT_STATUS_BADGES[paymentStatus] || PAYMENT_STATUS_BADGES.not_paid;

  const getCommentPlaceholder = () => {
    if (method === "card_transfer") return "Кому переводили";
    if (method === "bank_account") return "Номер счёта / примечание";
    return "Комментарий";
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(-1)}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Оплата</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-6 flex-1 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Сумма заявки</span>
                <span className="text-lg font-semibold">{totalAmount.toLocaleString()} Br</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Оплачено</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{paidAmount.toLocaleString()} Br</span>
                    <Badge className={`${statusBadge.className} text-xs`}>{statusBadge.label}</Badge>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-yellow-500" : "bg-white/[0.1]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{pct}%</span>
                  {remaining > 0 && <span>Остаток: {remaining.toLocaleString()} Br</span>}
                </div>
              </div>
            </div>

            {payments.length > 0 && (
              <DebugBadge id="Payments:list">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Платежи</label>
                {payments.map((p) => (
                  <div key={p.id} className="rounded-xl border border-white/[0.08] bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{p.amount.toLocaleString()} Br</span>
                          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-white/[0.04]">
                            {METHOD_LABELS[p.method] || p.method}
                          </span>
                        </div>
                        {p.comment && <p className="text-xs text-muted-foreground mt-1">{p.comment}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(p.created_at)}</p>
                      </div>
                      <button
                        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                        onClick={() => setDeleteId(p.id)}
                      >
                        <Icon name="Trash2" size={14} className="text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </DebugBadge>
            )}

            {payments.length === 0 && (
              <div className="text-center py-8">
                <Icon name="Banknote" size={40} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Платежей пока нет</p>
              </div>
            )}

            {paymentStatus !== "paid" && (
              <DebugBadge id="Payments:addBtn">
                <Button
                  className="w-full h-11 rounded-xl"
                  onClick={() => {
                    setAmount(remaining > 0 ? String(remaining) : "");
                    setDialogOpen(true);
                  }}
                >
                  <Icon name="Plus" size={16} />
                  <span className="ml-2">Добавить оплату</span>
                </Button>
              </DebugBadge>
            )}
          </>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить оплату</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Способ оплаты *</label>
              <DebugBadge id="Payments:method">
                <Select value={method} onValueChange={handleMethodChange}>
                  <SelectTrigger className="h-10 rounded-xl bg-secondary border-white/[0.08]">
                    <SelectValue placeholder="Выберите способ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Наличные</SelectItem>
                    <SelectItem value="card_transfer">Перевод на карту</SelectItem>
                    <SelectItem value="bank_account">На р/с</SelectItem>
                    <SelectItem value="return_offset">Зачёт возврата</SelectItem>
                  </SelectContent>
                </Select>
              </DebugBadge>
              {method === "return_offset" && (
                <p className="text-xs text-muted-foreground">
                  {balanceLoading
                    ? "Расчёт доступной суммы..."
                    : returnBalance > 0
                    ? `Доступно к зачёту: ${returnBalance.toLocaleString()} Br`
                    : "По этому оптовику нет принятых возвратов с остатком"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Сумма, Br *</label>
              <DebugBadge id="Payments:amount">
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </DebugBadge>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Комментарий</label>
              <DebugBadge id="Payments:comment">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={getCommentPlaceholder()}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </DebugBadge>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <DebugBadge id="Payments:saveBtn">
              <Button onClick={handleAdd} disabled={saving} className="rounded-xl">
                {saving ? <Icon name="Loader2" size={18} className="animate-spin" /> : <Icon name="Check" size={18} />}
                <span className="ml-2">{saving ? "Сохранение..." : "Сохранить"}</span>
              </Button>
            </DebugBadge>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить платёж?</AlertDialogTitle>
            <AlertDialogDescription>Платёж будет удалён, статус оплаты пересчитается.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrderPayments;