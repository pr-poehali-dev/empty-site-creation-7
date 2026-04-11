import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const MANAGERS_URL = "https://functions.poehali.dev/5d7e7b71-4625-4add-9399-92da64d8bd1e";

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
  const [newPhone, setNewPhone] = useState("+7");
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

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

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 1) return "+7";
    if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
    if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 9) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  };

  const cleanPhone = (formatted: string) => "+" + formatted.replace(/\D/g, "");

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits.length <= 11) {
      setNewPhone(formatPhone(e.target.value));
    }
  };

  const addManager = async () => {
    const clean = cleanPhone(newPhone);
    if (clean.length < 12) {
      toast({ title: "Ошибка", description: "Введите корректный номер", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const resp = await fetch(MANAGERS_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ phone: clean }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Управленец добавлен", description: `Номер ${newPhone}` });
        setAddDialogOpen(false);
        setNewPhone("+7");
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
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Авторизован</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Ждёт авторизации</Badge>;
      default:
        return <Badge variant="secondary">Не авторизован</Badge>;
    }
  };

  const renderManagerCard = (manager: Manager) => (
    <Card
      key={manager.id}
      className={`${manager.status === "pending" ? "cursor-pointer hover:border-primary transition-colors" : ""}`}
      onClick={() => {
        if (manager.status === "pending") {
          navigate(`/admin/authorize/${manager.id}`);
        }
      }}
    >
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Icon name="User" size={20} />
          </div>
          <div>
            <p className="font-medium">
              {manager.first_name && manager.last_name
                ? `${manager.first_name} ${manager.last_name}`
                : manager.phone}
            </p>
            {manager.first_name && (
              <p className="text-sm text-muted-foreground">{manager.phone}</p>
            )}
            {manager.role && (
              <p className="text-xs text-muted-foreground">{manager.role.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {manager.telegram_linked && (
            <Icon name="Send" size={16} className="text-blue-500" />
          )}
          {statusBadge(manager.status)}
          {manager.status === "authorized" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setDeactivateManager(manager); }}
            >
              <Icon name="UserX" size={16} />
            </Button>
          )}
          {manager.status === "pending" && (
            <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
          )}
        </div>
      </CardContent>
    </Card>
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
    return <div className="space-y-3">{list.map(renderManagerCard)}</div>;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Мир Техники плюс</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.phone}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <Icon name="LogOut" size={16} />
              <span className="ml-2">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Управленцы</h2>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Icon name="UserPlus" size={18} />
            <span className="ml-2">Добавить управленца</span>
          </Button>
        </div>

        <Tabs defaultValue="authorized">
          <TabsList className="w-full justify-start mb-4">
            <TabsTrigger value="authorized">
              Авторизованные ({authorized.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Ждут авторизации ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="not_authorized">
              Неавторизованные ({notAuthorized.length})
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить управленца</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Номер телефона</label>
              <Input
                type="tel"
                placeholder="+7 (___) ___-__-__"
                value={newPhone}
                onChange={handlePhoneInput}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={addManager} disabled={adding}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Деактивировать управленца?</DialogTitle>
          </DialogHeader>
          {deactivateManager && (
            <div className="py-4">
              <p className="text-sm">
                <span className="font-medium">{deactivateManager.first_name} {deactivateManager.last_name}</span>
                {" "}({deactivateManager.phone}) потеряет доступ к панели управления.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Управленец вернётся в список неавторизованных. Вы сможете авторизовать его повторно.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateManager(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
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
    </div>
  );
};

export default AdminDashboard;