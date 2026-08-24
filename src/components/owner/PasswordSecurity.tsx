import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import PasswordRules, { isPasswordValid } from "@/components/PasswordRules";

const AUTH_URL = "https://functions.poehali.dev/4a2cb8d4-f9ea-4107-a828-aced0209a15e";

interface PersonItem {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string;
}

interface Props {
  people: PersonItem[];
  token: string;
}

export default function PasswordSecurity({ people, token }: Props) {
  const { toast } = useToast();
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  const changePassword = async () => {
    setSaving(true);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=change_password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ old_password: oldPassword, password, confirm }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setOldPassword("");
        setPassword("");
        setConfirm("");
        toast({ title: "Пароль изменён" });
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось изменить пароль", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (phone: string, name: string) => {
    if (!confirmAction(name)) return;
    setResetting(phone);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=reset_password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ target_phone: phone }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({
          title: "Пароль сброшен",
          description: `${name} задаст новый пароль при следующем входе`,
        });
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сбросить пароль", variant: "destructive" });
    } finally {
      setResetting(null);
    }
  };

  const confirmAction = (name: string) =>
    window.confirm(`Сбросить пароль: ${name}?\n\nСтарый пароль перестанет работать.`);

  const personName = (p: PersonItem) =>
    [p.first_name, p.last_name].filter(Boolean).join(" ") || p.phone;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-white/[0.08] bg-card space-y-4">
        <div>
          <p className="font-medium">Пароль резервного входа</p>
          <p className="text-sm text-muted-foreground mt-1">
            Используется, когда Telegram недоступен. Появляется на странице входа после трёх
            неудачных попыток отправить код.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Текущий пароль</Label>
          <Input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="Текущий пароль"
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Новый пароль</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Новый пароль"
            className="h-10"
          />
        </div>

        <PasswordRules password={password} />

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Повторите пароль</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Повторите пароль"
            className="h-10"
          />
          {confirm && confirm !== password && (
            <p className="text-xs text-destructive">Пароли не совпадают</p>
          )}
        </div>

        <Button
          onClick={changePassword}
          disabled={!isPasswordValid(password) || password !== confirm || saving}
        >
          {saving ? (
            <Icon name="Loader2" size={16} className="animate-spin" />
          ) : (
            <Icon name="ShieldCheck" size={16} />
          )}
          <span className="ml-2">{saving ? "Сохранение..." : "Изменить пароль"}</span>
        </Button>
      </div>

      <div className="p-4 rounded-xl border border-white/[0.08] bg-card space-y-3">
        <div>
          <p className="font-medium">Сброс пароля сотрудникам</p>
          <p className="text-sm text-muted-foreground mt-1">
            После сброса сотрудник задаст новый пароль сам — при входе, когда появится кнопка
            «Войти по паролю».
          </p>
        </div>

        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет авторизованных сотрудников</p>
        ) : (
          <div className="space-y-2">
            {people.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.06] last:border-0"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{personName(p)}</div>
                  <div className="text-xs text-muted-foreground">{p.phone}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={resetting === p.phone}
                  onClick={() => resetPassword(p.phone, personName(p))}
                >
                  {resetting === p.phone ? (
                    <Icon name="Loader2" size={14} className="animate-spin" />
                  ) : (
                    <Icon name="RotateCcw" size={14} />
                  )}
                  <span className="ml-1.5">Сбросить</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
