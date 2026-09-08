import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

const MANAGERS_URL = "https://functions.poehali.dev/5d7e7b71-4625-4add-9399-92da64d8bd1e";

const WHOLESALER_ROLE = "Оптовик";

interface Firm {
  id: number;
  name: string;
}

interface Role {
  id: number;
  name: string;
}

interface Manager {
  id: number;
  phone: string;
  telegram_linked: boolean;
  first_name: string | null;
  last_name: string | null;
  role: { id: number; name: string } | null;
  status: string;
  created_at: string | null;
  auction_role?: string;
  wholesalers?: Firm[];
}

const AUCTION_ROLES = [
  { value: "none", label: "Нет доступа" },
  { value: "operator", label: "Оператор (создаёт лоты)" },
  { value: "admin", label: "Администратор (видит ставки)" },
];

const Users = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const [managers, setManagers] = useState<Manager[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deactivateManager, setDeactivateManager] = useState<Manager | null>(null);
  const [removeManager, setRemoveManager] = useState<Manager | null>(null);
  const [editManager, setEditManager] = useState<Manager | null>(null);
  const [newPhone, setNewPhone] = useState("+");
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [editAuctionRole, setEditAuctionRole] = useState("none");
  const [editFirmIds, setEditFirmIds] = useState<Set<number>>(new Set());
  const [firmQuery, setFirmQuery] = useState("");
  const [editing, setEditing] = useState(false);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchManagers = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(MANAGERS_URL, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        setManagers(data.managers || []);
        setRoles(data.roles || []);
        setFirms(data.wholesalers || []);
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить список", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin");
      return;
    }
    fetchManagers();
  }, []);

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (!value.startsWith("+")) value = "+" + value;
    const cleaned = "+" + value.replace(/[^\d]/g, "");
    if (cleaned.length <= 16) setNewPhone(cleaned);
  };

  const addManager = async () => {
    const digits = newPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ title: "Ошибка", description: "Введите корректный номер", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const resp = await fetch(MANAGERS_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ phone: newPhone }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Пользователь добавлен", description: `Номер ${newPhone}` });
        setAddDialogOpen(false);
        setNewPhone("+");
        fetchManagers();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось добавить", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleDeactivate = async (manager: Manager) => {
    setDeactivating(true);
    try {
      const resp = await fetch(`${MANAGERS_URL}?id=${manager.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Пользователь деактивирован", description: manager.phone });
        setDeactivateManager(null);
        fetchManagers();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось деактивировать", variant: "destructive" });
    } finally {
      setDeactivating(false);
    }
  };

  const handleRemove = async (manager: Manager) => {
    setRemoving(true);
    try {
      const resp = await fetch(`${MANAGERS_URL}?id=${manager.id}&action=remove`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Пользователь удалён", description: manager.phone });
        setRemoveManager(null);
        fetchManagers();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  const openEditDialog = (manager: Manager) => {
    setEditManager(manager);
    setEditFirstName(manager.first_name || "");
    setEditLastName(manager.last_name || "");
    setEditRoleId(manager.role ? String(manager.role.id) : "");
    setEditAuctionRole(manager.auction_role || "none");
    setEditFirmIds(new Set((manager.wholesalers || []).map((w) => w.id)));
    setFirmQuery("");
  };

  const selectedRoleName = roles.find((r) => String(r.id) === editRoleId)?.name || "";
  const isWholesalerRole = selectedRoleName === WHOLESALER_ROLE;

  const toggleFirm = (id: number) => {
    setEditFirmIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEdit = async () => {
    if (!editManager) return;
    if (!editFirstName.trim() || !editLastName.trim() || !editRoleId) {
      toast({ title: "Ошибка", description: "Заполните все поля", variant: "destructive" });
      return;
    }
    if (isWholesalerRole && editFirmIds.size === 0) {
      toast({
        title: "Не выбрана фирма",
        description: "Для оптовика укажите хотя бы одну фирму",
        variant: "destructive",
      });
      return;
    }
    setEditing(true);
    try {
      const resp = await fetch(`${MANAGERS_URL}?id=${editManager.id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          role_id: Number(editRoleId),
          auction_role: editAuctionRole,
          wholesaler_ids: isWholesalerRole ? Array.from(editFirmIds) : [],
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Данные обновлены" });
        setEditManager(null);
        fetchManagers();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось обновить", variant: "destructive" });
    } finally {
      setEditing(false);
    }
  };

  const isWholesaler = (m: Manager) => m.role?.name === WHOLESALER_ROLE;

  const authorized = managers.filter((m) => m.status === "authorized");
  const pending = managers.filter((m) => m.status === "pending");
  const notAuthorized = managers.filter((m) => m.status === "not_authorized");
  const staffList = authorized.filter((m) => !isWholesaler(m));
  const wholesalerList = authorized.filter(isWholesaler);

  const statusBadge = (status: string) => {
    switch (status) {
      case "authorized":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/20">Авторизован</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20">Ждёт авторизации</Badge>;
      default:
        return <Badge className="bg-white/[0.06] text-muted-foreground border-white/[0.08] hover:bg-white/[0.06]">Не авторизован</Badge>;
    }
  };

  const renderManagerCard = (manager: Manager) => (
    <div
      key={manager.id}
      className={`rounded-xl border border-white/[0.08] bg-card p-3 sm:p-4 ${
        manager.status === "pending" ? "cursor-pointer hover:border-primary/50 transition-colors" : ""
      }`}
      onClick={() => {
        if (manager.status === "pending") navigate(`/admin/authorize/${manager.id}`);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
            <Icon name={isWholesaler(manager) ? "Building2" : "User"} size={18} className="text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm sm:text-base truncate">
              {manager.first_name && manager.last_name
                ? `${manager.first_name} ${manager.last_name}`
                : manager.phone}
            </p>
            {manager.first_name && (
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{manager.phone}</p>
            )}
            {manager.role && (
              <p className="text-xs text-muted-foreground">{manager.role.name}</p>
            )}
            {isWholesaler(manager) && (manager.wholesalers?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground truncate">
                {manager.wholesalers!.map((w) => w.name).join(", ")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {manager.telegram_linked && <Icon name="Send" size={14} className="text-blue-400" />}
          <span className="hidden sm:inline-flex">{statusBadge(manager.status)}</span>
          {manager.status === "authorized" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-white/[0.06]"
                onClick={(e) => { e.stopPropagation(); openEditDialog(manager); }}
              >
                <Icon name="Pencil" size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); setDeactivateManager(manager); }}
              >
                <Icon name="UserX" size={14} />
              </Button>
            </>
          )}
          {manager.status === "not_authorized" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); setRemoveManager(manager); }}
            >
              <Icon name="Trash2" size={14} />
            </Button>
          )}
          {manager.status === "pending" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); setDeactivateManager(manager); }}
              >
                <Icon name="X" size={14} />
              </Button>
              <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderList = (list: Manager[], emptyText: string) => {
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (list.length === 0) {
      return <p className="text-center text-muted-foreground py-8">{emptyText}</p>;
    }
    return <div className="space-y-2">{list.map(renderManagerCard)}</div>;
  };

  const visibleFirms = firmQuery.trim()
    ? firms.filter((f) => f.name.toLowerCase().includes(firmQuery.trim().toLowerCase()))
    : firms;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate("/admin/dashboard")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Пользователи</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 sm:py-6">
        <div className="flex items-center justify-end mb-5">
          <Button
            className="h-9 sm:h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setAddDialogOpen(true)}
          >
            <Icon name="UserPlus" size={16} />
            <span className="ml-2 hidden sm:inline">Добавить пользователя</span>
            <span className="ml-1 sm:hidden">Добавить</span>
          </Button>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="w-full justify-start mb-4 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 overflow-x-auto">
            <TabsTrigger value="all" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white/[0.1]">
              Пользователи ({managers.length})
            </TabsTrigger>
            <TabsTrigger value="staff" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white/[0.1]">
              Управленцы ({staffList.length})
            </TabsTrigger>
            <TabsTrigger value="wholesalers" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white/[0.1]">
              Оптовики ({wholesalerList.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Авторизованные ({authorized.length})
                </p>
                {renderList(authorized, "Нет авторизованных пользователей")}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Ждут авторизации ({pending.length})
                </p>
                {renderList(pending, "Никто не ждёт авторизации")}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Не авторизованные ({notAuthorized.length})
                </p>
                {renderList(notAuthorized, "Нет неавторизованных")}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="staff">
            {renderList(staffList, "Нет управленцев")}
          </TabsContent>

          <TabsContent value="wholesalers">
            {renderList(wholesalerList, "Нет оптовиков")}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить пользователя</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Номер телефона</label>
              <DebugBadge id="Users:addPhone">
                <Input
                  type="tel"
                  placeholder="+7XXXXXXXXXX"
                  value={newPhone}
                  onChange={handlePhoneInput}
                  className="h-11 rounded-xl bg-secondary border-white/[0.08]"
                />
              </DebugBadge>
            </div>
            <p className="text-xs text-muted-foreground">
              После добавления пользователь пишет боту в Telegram, затем вы назначаете ему роль.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <Button onClick={addManager} disabled={adding} className="rounded-xl bg-primary hover:bg-primary/90">
              {adding ? <Icon name="Loader2" size={18} className="animate-spin" /> : <Icon name="UserPlus" size={18} />}
              <span className="ml-2">{adding ? "Добавление..." : "Добавить"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateManager} onOpenChange={(open) => !open && setDeactivateManager(null)}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Деактивировать пользователя?</DialogTitle>
          </DialogHeader>
          {deactivateManager && (
            <div className="py-4">
              <p className="text-sm">
                {deactivateManager.first_name && deactivateManager.last_name ? (
                  <><span className="font-medium">{deactivateManager.first_name} {deactivateManager.last_name}</span>{" "}({deactivateManager.phone})</>
                ) : (
                  <span className="font-medium">{deactivateManager.phone}</span>
                )}
                {deactivateManager.status === "pending"
                  ? " будет отклонён и переведён в неавторизованные."
                  : " потеряет доступ к системе."}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Пользователь вернётся в список неавторизованных. Вы сможете авторизовать его повторно.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeactivateManager(null)} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => deactivateManager && handleDeactivate(deactivateManager)}
              disabled={deactivating}
            >
              {deactivating ? <Icon name="Loader2" size={18} className="animate-spin" /> : <Icon name="UserX" size={18} />}
              <span className="ml-2">{deactivating ? "Деактивация..." : "Деактивировать"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeManager} onOpenChange={(open) => !open && setRemoveManager(null)}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить пользователя?</DialogTitle>
          </DialogHeader>
          {removeManager && (
            <div className="py-4">
              <p className="text-sm">
                Номер <span className="font-medium">{removeManager.phone}</span> будет полностью удалён из системы.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Это действие необратимо. Чтобы добавить его снова, придётся ввести номер заново.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRemoveManager(null)} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => removeManager && handleRemove(removeManager)}
              disabled={removing}
            >
              {removing ? <Icon name="Loader2" size={18} className="animate-spin" /> : <Icon name="Trash2" size={18} />}
              <span className="ml-2">{removing ? "Удаление..." : "Удалить"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editManager} onOpenChange={(open) => !open && setEditManager(null)}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Настройки пользователя</DialogTitle>
          </DialogHeader>
          {editManager && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">{editManager.phone}</p>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Имя</label>
                <Input
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="h-11 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Фамилия</label>
                <Input
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className="h-11 rounded-xl bg-secondary border-white/[0.08]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Роль</label>
                <Select value={editRoleId} onValueChange={setEditRoleId}>
                  <SelectTrigger className="h-11 rounded-xl bg-secondary border-white/[0.08]">
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isWholesalerRole && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Фирмы <span className="text-destructive">*</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Пользователь получит доступ к заявкам выбранных фирм. Можно выбрать несколько.
                  </p>
                  {firms.length > 8 && (
                    <Input
                      value={firmQuery}
                      onChange={(e) => setFirmQuery(e.target.value)}
                      placeholder="Поиск фирмы"
                      className="h-9 rounded-xl bg-secondary border-white/[0.08] text-sm"
                    />
                  )}
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-white/[0.08] divide-y divide-white/[0.06]">
                    {visibleFirms.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">Фирмы не найдены</p>
                    ) : (
                      visibleFirms.map((f) => (
                        <label
                          key={f.id}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03]"
                        >
                          <Checkbox
                            checked={editFirmIds.has(f.id)}
                            onCheckedChange={() => toggleFirm(f.id)}
                          />
                          <span className="text-sm">{f.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {editFirmIds.size > 0 && (
                    <p className="text-xs text-muted-foreground">Выбрано: {editFirmIds.size}</p>
                  )}
                </div>
              )}

              {!isWholesalerRole && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Доступ к аукциону</label>
                  <Select value={editAuctionRole} onValueChange={setEditAuctionRole}>
                    <SelectTrigger className="h-11 rounded-xl bg-secondary border-white/[0.08]">
                      <SelectValue placeholder="Выберите доступ" />
                    </SelectTrigger>
                    <SelectContent>
                      {AUCTION_ROLES.map((ar) => (
                        <SelectItem key={ar.value} value={ar.value}>
                          {ar.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditManager(null)} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <Button onClick={handleEdit} disabled={editing} className="rounded-xl bg-primary hover:bg-primary/90">
              {editing ? <Icon name="Loader2" size={18} className="animate-spin" /> : <Icon name="Check" size={18} />}
              <span className="ml-2">{editing ? "Сохранение..." : "Сохранить"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
