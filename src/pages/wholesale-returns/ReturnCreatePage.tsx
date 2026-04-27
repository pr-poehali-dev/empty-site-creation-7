import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const WHOLESALERS_URL = "https://functions.poehali.dev/03df983f-e7e9-4cd5-9427-e61b88d1171f";

interface ReturnLine {
  product_id: number | null;
  temp_product_id?: number | null;
  name: string;
  article: string | null;
  quantity: number;
  price: number;
  is_temp?: boolean;
  has_uuid?: boolean;
}

interface ProductSearchItem {
  id: number;
  name: string;
  article: string | null;
  brand: string | null;
  external_id?: string | null;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: "Черновик", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  confirmed: { label: "Подтверждён", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  accepted: { label: "Принят", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  archived: { label: "Архив", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

// Подтвердить <-> Принять
const NEXT_STATUS: Record<string, { status: string; label: string; icon: string }> = {
  draft: { status: "confirmed", label: "Подтвердить", icon: "CheckCircle" },
  confirmed: { status: "accepted", label: "Принять", icon: "PackageCheck" },
};
const PREV_STATUS: Record<string, { status: string; label: string; icon: string }> = {
  confirmed: { status: "draft", label: "В черновик", icon: "Undo2" },
  accepted: { status: "confirmed", label: "Откатить к подтверждению", icon: "Undo2" },
};

const ReturnCreatePage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editId = id ? parseInt(id) : null;
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";

  const [customerName, setCustomerName] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [wholesalers, setWholesalers] = useState<{ id: number; name: string }[]>([]);
  const [wholesalerId, setWholesalerId] = useState<number | null>(null);
  const [showWholesalerList, setShowWholesalerList] = useState(false);
  const wholesalerRef = useRef<HTMLDivElement>(null);

  const [returnStatus, setReturnStatus] = useState("draft");
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Загрузка справочника оптовиков
  useEffect(() => {
    fetch(WHOLESALERS_URL, { headers: authHeaders })
      .then(r => r.json())
      .then(data => setWholesalers(data.items || []))
      .catch(() => setWholesalers([]));
  }, []);

  // Загрузка возврата при редактировании
  useEffect(() => {
    if (!editId) return;
    const load = async () => {
      try {
        const resp = await fetch(`${RETURNS_URL}?id=${editId}`, { headers: authHeaders });
        const data = await resp.json();
        if (resp.ok && data.return) {
          setCustomerName(data.return.customer_name || "");
          setComment(data.return.comment || "");
          setReturnStatus(data.return.status || "draft");
          setLines(
            (data.return.items || []).map((item: ReturnLine) => ({
              product_id: item.product_id,
              name: item.name,
              article: item.article,
              quantity: item.quantity,
              price: item.price,
              is_temp: item.is_temp,
              temp_product_id: item.temp_product_id,
              has_uuid: item.has_uuid,
            }))
          );
          const wResp = await fetch(WHOLESALERS_URL, { headers: authHeaders });
          const wData = await wResp.json();
          const found = (wData.items || []).find((w: { id: number; name: string }) => w.name === data.return.customer_name);
          if (found) setWholesalerId(found.id);
        }
      } catch {
        toast({ title: "Ошибка", description: "Не удалось загрузить возврат", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [editId]);

  // Закрытие dropdown при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wholesalerRef.current && !wholesalerRef.current.contains(e.target as Node)) {
        setShowWholesalerList(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: query, search_type: "all", per_page: "10" });
      const resp = await fetch(`${PRODUCTS_URL}?${params}`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setSearchResults(data.items || []);
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, [token]);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchProducts(value);
    }, 300);
  };

  const addItem = (item: ProductSearchItem) => {
    setLines((prev) => [
      {
        product_id: item.id,
        name: item.name,
        article: item.article,
        quantity: 1,
        price: 0,
        is_temp: false,
        has_uuid: !!item.external_id,
      },
      ...prev,
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const updateLine = (idx: number, patch: Partial<ReturnLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const total = lines.reduce((sum, l) => sum + l.quantity * l.price, 0);

  const isReadOnly = returnStatus === "accepted" || returnStatus === "archived";

  const handleSave = async () => {
    if (!customerName.trim()) {
      toast({ title: "Ошибка", description: "Укажите оптовика", variant: "destructive" });
      return;
    }
    if (lines.length === 0) {
      toast({ title: "Ошибка", description: "Добавьте хотя бы одну позицию", variant: "destructive" });
      return;
    }

    const items = lines.map((l) => ({
      product_id: l.product_id,
      temp_product_id: l.temp_product_id || null,
      name: l.name,
      quantity: l.quantity,
      price: l.price,
    }));

    setSaving(true);
    try {
      const url = editId ? `${RETURNS_URL}?id=${editId}` : RETURNS_URL;
      const method = editId ? "PUT" : "POST";
      const resp = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify({ customer_name: customerName.trim(), comment: comment.trim() || null, items }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: editId ? "Возврат обновлён" : "Возврат создан" });
        navigate("/admin/returns");
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось сохранить", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (newStatus: string) => {
    if (!editId) return;
    setStatusUpdating(true);
    try {
      const resp = await fetch(`${RETURNS_URL}?id=${editId}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setReturnStatus(newStatus);
        toast({ title: "Статус обновлён" });
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось обновить статус", variant: "destructive" });
    } finally {
      setStatusUpdating(false);
    }
  };

  const next = NEXT_STATUS[returnStatus];
  const prev = PREV_STATUS[returnStatus];
  const st = statusLabels[returnStatus] || statusLabels.draft;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/returns")}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold truncate">
              {editId ? `Возврат #${editId}` : "Новый возврат"}
            </h1>
            {editId && <Badge className={`${st.className} text-xs`}>{st.label}</Badge>}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-6 flex-1 space-y-4">
        {/* Оптовик */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Оптовик *</label>
          <DebugBadge id="Returns:wholesaler">
            <div ref={wholesalerRef} className="relative">
              <Input
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setShowWholesalerList(true);
                  const found = wholesalers.find((w) => w.name === e.target.value);
                  setWholesalerId(found ? found.id : null);
                }}
                onFocus={() => setShowWholesalerList(true)}
                placeholder="Имя оптовика"
                disabled={isReadOnly}
                className="h-10 rounded-xl bg-secondary border-white/[0.08]"
              />
              {showWholesalerList && wholesalers.length > 0 && !isReadOnly && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-xl border border-white/[0.08] bg-card shadow-lg z-10">
                  {wholesalers
                    .filter((w) => w.name.toLowerCase().includes(customerName.toLowerCase()))
                    .map((w) => (
                      <button
                        key={w.id}
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.04] text-sm"
                        onClick={() => {
                          setCustomerName(w.name);
                          setWholesalerId(w.id);
                          setShowWholesalerList(false);
                        }}
                      >
                        {w.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </DebugBadge>
        </div>

        {/* Комментарий */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Комментарий</label>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Причина возврата, примечание"
            disabled={isReadOnly}
            className="h-10 rounded-xl bg-secondary border-white/[0.08]"
          />
        </div>

        {/* Поиск товара */}
        {!isReadOnly && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Добавить товар</label>
            <DebugBadge id="Returns:search">
              <div className="relative">
                <Input
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="Поиск по названию или артикулу"
                  className="h-10 rounded-xl bg-secondary border-white/[0.08] pr-9"
                />
                {searching && (
                  <Icon
                    name="Loader2"
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                  />
                )}
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-auto rounded-xl border border-white/[0.08] bg-card shadow-lg z-10">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.04] border-b border-white/[0.04] last:border-0"
                        onClick={() => addItem(p)}
                      >
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.article && (
                          <p className="text-xs text-muted-foreground">{p.brand} · {p.article}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </DebugBadge>
          </div>
        )}

        {/* Список позиций */}
        {lines.length > 0 && (
          <DebugBadge id="Returns:items">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Позиции ({lines.length})</label>
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{line.name}</p>
                      {line.article && (
                        <p className="text-xs text-muted-foreground">{line.article}</p>
                      )}
                    </div>
                    {!isReadOnly && (
                      <button
                        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                        onClick={() => removeLine(idx)}
                      >
                        <Icon name="X" size={14} className="text-destructive" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Кол-во</label>
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: parseInt(e.target.value) || 0 })}
                        disabled={isReadOnly}
                        className="h-9 rounded-lg bg-secondary border-white/[0.08]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Цена</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={line.price}
                        onChange={(e) => updateLine(idx, { price: parseFloat(e.target.value) || 0 })}
                        disabled={isReadOnly}
                        className="h-9 rounded-lg bg-secondary border-white/[0.08]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Сумма</label>
                      <div className="h-9 flex items-center px-3 rounded-lg bg-secondary text-sm">
                        {(line.quantity * line.price).toLocaleString()} Br
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DebugBadge>
        )}

        {/* Итог */}
        <div className="rounded-xl border border-white/[0.08] bg-card p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Итого</span>
          <span className="text-lg font-semibold">{total.toLocaleString()} Br</span>
        </div>

        {/* Кнопки действий */}
        <div className="flex flex-col gap-2 pt-2">
          {!isReadOnly && (
            <DebugBadge id="Returns:saveBtn">
              <Button onClick={handleSave} disabled={saving} className="h-11 rounded-xl w-full">
                {saving ? (
                  <Icon name="Loader2" size={18} className="animate-spin" />
                ) : (
                  <Icon name="Check" size={18} />
                )}
                <span className="ml-2">{saving ? "Сохранение..." : "Сохранить"}</span>
              </Button>
            </DebugBadge>
          )}

          {editId && next && !isOwner && (
            <DebugBadge id="Returns:nextStatus">
              <Button
                variant="outline"
                onClick={() => changeStatus(next.status)}
                disabled={statusUpdating}
                className="h-11 rounded-xl border-white/[0.08] w-full"
              >
                <Icon name={next.icon} size={18} />
                <span className="ml-2">{next.label}</span>
              </Button>
            </DebugBadge>
          )}

          {editId && prev && !isOwner && (
            <DebugBadge id="Returns:prevStatus">
              <Button
                variant="outline"
                onClick={() => changeStatus(prev.status)}
                disabled={statusUpdating}
                className="h-11 rounded-xl border-white/[0.08] w-full text-muted-foreground"
              >
                <Icon name={prev.icon} size={18} />
                <span className="ml-2">{prev.label}</span>
              </Button>
            </DebugBadge>
          )}
        </div>
      </main>
    </div>
  );
};

export default ReturnCreatePage;
