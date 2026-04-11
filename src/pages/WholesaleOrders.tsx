import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";
const NOMENCLATURE_URL = "https://functions.poehali.dev/b9921fd5-1333-471a-9ee5-86e701e904c6";

interface Order {
  id: number;
  customer_name: string;
  comment: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  created_by: string;
}

interface NomSearchItem {
  id: number;
  name: string;
  article: string | null;
  brand: string | null;
  price_wholesale: number | null;
}

interface OrderLine {
  nomenclature_id: number;
  name: string;
  article: string | null;
  quantity: number;
  price: number;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  new: { label: "Новая", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  confirmed: { label: "Подтверждена", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  shipped: { label: "Отгружена", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  completed: { label: "Завершена", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  cancelled: { label: "Отменена", className: "bg-red-500/20 text-red-400 border-red-500/30" },
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

  const [createOpen, setCreateOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NomSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(ORDERS_URL, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        setOrders(data.orders || []);
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить заявки", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOrders();
  }, []);

  const searchNomenclature = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const resp = await fetch(`${NOMENCLATURE_URL}?search=${encodeURIComponent(searchQuery)}`, {
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok) {
        setSearchResults(data.items || []);
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось найти номенклатуру", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const addLine = (item: NomSearchItem) => {
    if (lines.some((l) => l.nomenclature_id === item.id)) {
      toast({ title: "Уже добавлено", variant: "destructive" });
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        nomenclature_id: item.id,
        name: item.name,
        article: item.article,
        quantity: 1,
        price: item.price_wholesale || 0,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const updateLineQty = (index: number, qty: number) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, qty) } : l)));
  };

  const updateLinePrice = (index: number, price: number) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, price: Math.max(0, price) } : l)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const totalAmount = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const handleCreate = async () => {
    if (!customerName.trim()) {
      toast({ title: "Ошибка", description: "Укажите имя оптовика", variant: "destructive" });
      return;
    }
    if (lines.length === 0) {
      toast({ title: "Ошибка", description: "Добавьте хотя бы одну позицию", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch(ORDERS_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          customer_name: customerName.trim(),
          comment: comment.trim() || null,
          items: lines.map((l) => ({
            nomenclature_id: l.nomenclature_id,
            quantity: l.quantity,
            price: l.price,
          })),
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Заявка создана" });
        setCreateOpen(false);
        setCustomerName("");
        setComment("");
        setLines([]);
        fetchOrders();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось создать заявку", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
            {canCreate && (
              <Button className="h-9" onClick={() => setCreateOpen(true)}>
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
            <p className="text-muted-foreground">Заявок пока нет</p>
            {canCreate && (
              <p className="text-sm text-muted-foreground mt-1">Нажмите «Создать заявку» для начала</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const st = statusLabels[order.status] || statusLabels.new;
              return (
                <div
                  key={order.id}
                  className="rounded-xl border border-white/[0.08] bg-card p-3 sm:p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm sm:text-base">{order.customer_name}</p>
                        <Badge className={`${st.className} text-xs hover:${st.className}`}>{st.label}</Badge>
                      </div>
                      {order.comment && (
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">{order.comment}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(order.created_at)} · {order.created_by}
                      </p>
                    </div>
                    <p className="text-sm sm:text-base font-semibold flex-shrink-0">
                      {order.total_amount.toLocaleString()} ₽
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create order dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Создать заявку</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Оптовик *</label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Имя или название компании"
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Комментарий</label>
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Примечание к заявке"
                  className="h-10 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Добавить позицию</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Поиск по названию, артикулу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchNomenclature()}
                  className="h-10 rounded-xl bg-secondary border-white/[0.08] text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 flex-shrink-0"
                  onClick={searchNomenclature}
                  disabled={searching}
                >
                  {searching ? (
                    <Icon name="Loader2" size={16} className="animate-spin" />
                  ) : (
                    <Icon name="Search" size={16} />
                  )}
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="border border-white/[0.08] rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      className="w-full text-left px-3 py-2 hover:bg-white/[0.06] transition-colors text-sm flex items-center justify-between"
                      onClick={() => addLine(item)}
                    >
                      <div className="min-w-0">
                        <span className="truncate block">{item.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.article && `${item.article} · `}{item.brand || ""}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {item.price_wholesale ? `${item.price_wholesale.toLocaleString()} ₽` : "—"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lines.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Позиции ({lines.length})</label>
                <div className="space-y-1.5">
                  {lines.map((line, i) => (
                    <div
                      key={line.nomenclature_id}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 flex items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{line.name}</p>
                        {line.article && <p className="text-xs text-muted-foreground">{line.article}</p>}
                      </div>
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateLineQty(i, parseInt(e.target.value) || 1)}
                        className="w-16 h-8 text-center text-sm rounded-lg bg-secondary border-white/[0.08] px-1"
                        min={1}
                      />
                      <Input
                        type="number"
                        value={line.price}
                        onChange={(e) => updateLinePrice(i, parseFloat(e.target.value) || 0)}
                        className="w-24 h-8 text-sm rounded-lg bg-secondary border-white/[0.08] px-2"
                      />
                      <span className="text-sm font-medium w-20 text-right flex-shrink-0">
                        {(line.price * line.quantity).toLocaleString()} ₽
                      </span>
                      <button
                        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                        onClick={() => removeLine(i)}
                      >
                        <Icon name="X" size={14} className="text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-2 border-t border-white/[0.08]">
                  <p className="text-base font-semibold">Итого: {totalAmount.toLocaleString()} ₽</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => { setCreateOpen(false); setCustomerName(""); setComment(""); setLines([]); setSearchResults([]); setSearchQuery(""); }}
              className="rounded-xl border-white/[0.08]"
            >
              Отмена
            </Button>
            <Button onClick={handleCreate} disabled={saving} className="rounded-xl">
              {saving ? (
                <Icon name="Loader2" size={18} className="animate-spin" />
              ) : (
                <Icon name="Check" size={18} />
              )}
              <span className="ml-2">{saving ? "Сохранение..." : "Сохранить"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WholesaleOrders;
