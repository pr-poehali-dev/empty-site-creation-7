import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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

const MANAGERS_URL = "https://functions.poehali.dev/5d7e7b71-4625-4add-9399-92da64d8bd1e";

const ROLES = [
  { id: 1, name: "Управляющий" },
  { id: 2, name: "Менеджер опта" },
  { id: 3, name: "Менеджер розницы" },
  { id: 4, name: "Продавец" },
];

interface Manager {
  id: number;
  phone: string;
  telegram_linked: boolean;
  first_name: string | null;
  last_name: string | null;
  role: { id: number; name: string } | null;
  status: string;
  created_at: string | null;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const [managers, setManagers] = useState<Manager[]>([]);
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
    if (cleaned.length <= 16) {
      setNewPhone(cleaned);
    }
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
        toast({ title: "Управленец добавлен", description: `Номер ${newPhone}` });
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
        toast({ title: "Управленец деактивирован", description: manager.phone });
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
        toast({ title: "Управленец удалён", description: manager.phone });
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
  };

  const handleEdit = async () => {
    if (!editManager) return;
    if (!editFirstName.trim() || !editLastName.trim() || !editRoleId) {
      toast({ title: "Ошибка", description: "Заполните все поля", variant: "destructive" });
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

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/admin");
  };

  const authorized = managers.filter((m) => m.status === "authorized");
  const pending = managers.filter((m) => m.status === "pending");
  const notAuthorized = managers.filter((m) => m.status === "not_authorized");

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
        if (manager.status === "pending") {
          navigate(`/admin/authorize/${manager.id}`);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
            <Icon name="User" size={18} className="text-muted-foreground" />
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
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {manager.telegram_linked && (
            <Icon name="Send" size={14} className="text-blue-400" />
          )}
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <h1 className="text-lg sm:text-xl font-semibold">Мир Техники плюс</h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{user.phone}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 hover:bg-white/[0.06]"
              onClick={handleLogout}
            >
              <Icon name="LogOut" size={16} />
              <span className="ml-2 hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex gap-2 mb-5 sm:mb-6 flex-wrap">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate("/admin/catalog")}
          >
            <Icon name="Package" size={20} />
            <span className="font-medium">Каталог</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate("/admin/orders")}
          >
            <Icon name="ClipboardList" size={20} />
            <span className="font-medium">Заявки</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate("/admin/exchange-1c")}
          >
            <Icon name="RefreshCw" size={20} />
            <span className="font-medium">Обмен с 1С</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate("/admin/wholesalers")}
          >
            <Icon name="Users" size={20} />
            <span className="font-medium">Оптовики</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate("/admin/pricing")}
          >
            <Icon name="Calculator" size={20} />
            <span className="font-medium">Определение цен</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate("/admin/instructions")}
          >
            <Icon name="BookOpen" size={20} />
            <span className="font-medium">Инструкции от Юры</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-red-500/30 justify-start gap-3 text-red-400 hover:text-red-300 hover:border-red-500/50"
            onClick={() => navigate("/admin/new-products")}
          >
            <Icon name="PackagePlus" size={20} />
            <span className="font-medium">Новые товары</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-red-500/30 justify-start gap-3 text-red-400 hover:text-red-300 hover:border-red-500/50"
            onClick={() => navigate("/admin/new-barcodes")}
          >
            <Icon name="ScanLine" size={20} />
            <span className="font-medium">Новые штрихкоды</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate("/admin/brands")}
          >
            <Icon name="Tag" size={20} />
            <span className="font-medium">Бренды</span>
          </Button>
        </div>

        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold">Управленцы</h2>
          <Button
            className="h-9 sm:h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setAddDialogOpen(true)}
          >
            <Icon name="UserPlus" size={16} />
            <span className="ml-2 hidden sm:inline">Добавить управленца</span>
            <span className="ml-1 sm:hidden">Добавить</span>
          </Button>
        </div>

        <Tabs defaultValue="authorized">
          <TabsList className="w-full justify-start mb-4 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 overflow-x-auto">
            <TabsTrigger value="authorized" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white/[0.1]">
              Авторизованные ({authorized.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white/[0.1]">
              Ожидают ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="not_authorized" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white/[0.1]">
              Новые ({notAuthorized.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="authorized">
            {renderList(authorized, "Нет авторизованных управленцев")}
          </TabsContent>
          <TabsContent value="pending">
            {renderList(pending, "Нет управленцев, ожидающих авторизации")}
          </TabsContent>
          <TabsContent value="not_authorized">
            {renderList(notAuthorized, "Нет неавторизованных управленцев")}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить управленца</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Номер телефона</label>
              <Input
                type="tel"
                placeholder="+7XXXXXXXXXX"
                value={newPhone}
                onChange={handlePhoneInput}
                className="h-11 rounded-xl bg-secondary border-white/[0.08]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <Button onClick={addManager} disabled={adding} className="rounded-xl bg-primary hover:bg-primary/90">
              {adding ? (
                <Icon name="Loader2" size={18} className="animate-spin" />
              ) : (
                <Icon name="UserPlus" size={18} />
              )}
              <span className="ml-2">{adding ? "Добавление..." : "Добавить"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateManager} onOpenChange={(open) => !open && setDeactivateManager(null)}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Деактивировать управленца?</DialogTitle>
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
                  : " потеряет доступ к панели управления."}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Управленец вернётся в список неавторизованных. Вы сможете авторизовать его повторно.
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
              {deactivating ? (
                <Icon name="Loader2" size={18} className="animate-spin" />
              ) : (
                <Icon name="UserX" size={18} />
              )}
              <span className="ml-2">{deactivating ? "Деактивация..." : "Деактивировать"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeManager} onOpenChange={(open) => !open && setRemoveManager(null)}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить управленца?</DialogTitle>
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
              {removing ? (
                <Icon name="Loader2" size={18} className="animate-spin" />
              ) : (
                <Icon name="Trash2" size={18} />
              )}
              <span className="ml-2">{removing ? "Удаление..." : "Удалить"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editManager} onOpenChange={(open) => !open && setEditManager(null)}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать управленца</DialogTitle>
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
                    {ROLES.map((role) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditManager(null)} className="rounded-xl border-white/[0.08]">
              Отмена
            </Button>
            <Button onClick={handleEdit} disabled={editing} className="rounded-xl bg-primary hover:bg-primary/90">
              {editing ? (
                <Icon name="Loader2" size={18} className="animate-spin" />
              ) : (
                <Icon name="Check" size={18} />
              )}
              <span className="ml-2">{editing ? "Сохранение..." : "Сохранить"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;