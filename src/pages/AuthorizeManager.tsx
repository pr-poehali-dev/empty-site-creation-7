import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  status: string;
}

const AuthorizeManager = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const [manager, setManager] = useState<Manager | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    const fetchManager = async () => {
      try {
        const resp = await fetch(`${MANAGERS_URL}?status=pending`, { headers: authHeaders });
        const data = await resp.json();
        if (resp.ok) {
          const found = (data.managers || []).find((m: Manager) => m.id === Number(id));
          if (found) {
            setManager(found);
          } else {
            toast({ title: "Ошибка", description: "Управленец не найден", variant: "destructive" });
            navigate("/admin/dashboard");
          }
        }
      } catch {
        toast({ title: "Ошибка", description: "Не удалось загрузить данные", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    fetchManager();
  }, [id]);

  const authorize = async () => {
    if (!firstName.trim() || !lastName.trim() || !roleId) {
      toast({ title: "Ошибка", description: "Заполните все поля", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch(`${MANAGERS_URL}?id=${id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          role_id: Number(roleId),
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Управленец авторизован" });
        navigate("/admin/dashboard");
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось авторизовать", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!manager) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate("/admin/dashboard")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg sm:text-xl font-semibold">Авторизация управленца</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 sm:py-8">
        <div className="rounded-2xl border border-white/[0.08] bg-card p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-lg font-medium">{manager.phone}</p>
            <div className="flex items-center gap-2 mt-1">
              {manager.telegram_linked ? (
                <span className="text-xs text-blue-400 flex items-center gap-1">
                  <Icon name="Send" size={12} />
                  Telegram привязан
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Telegram не привязан</span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Имя</label>
              <Input
                placeholder="Иван"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-11 rounded-xl bg-secondary border-white/[0.08]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Фамилия</label>
              <Input
                placeholder="Иванов"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-11 rounded-xl bg-secondary border-white/[0.08]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Роль</label>
              <Select value={roleId} onValueChange={setRoleId}>
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
            <Button
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
              onClick={authorize}
              disabled={submitting}
            >
              {submitting ? (
                <Icon name="Loader2" size={18} className="animate-spin" />
              ) : (
                <Icon name="UserCheck" size={18} />
              )}
              <span className="ml-2">{submitting ? "Авторизация..." : "Авторизовать управленца"}</span>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AuthorizeManager;
