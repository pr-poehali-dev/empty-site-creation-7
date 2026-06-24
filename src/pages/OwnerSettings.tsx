import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const SETTINGS_URL = "https://functions.poehali.dev/82a95791-7a9f-4f40-8167-eb96c3045d34";
const MANAGERS_URL = "https://functions.poehali.dev/5d7e7b71-4625-4add-9399-92da64d8bd1e";

interface ManagerItem {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string;
}

const OwnerSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";

  const [lockNonNew, setLockNonNew] = useState(false);
  const [recalcOnlyNew, setRecalcOnlyNew] = useState(false);
  const [recalcAllowedUsers, setRecalcAllowedUsers] = useState<string[]>([]);
  const [managers, setManagers] = useState<ManagerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin");
      return;
    }
    loadSettings();
    loadManagers();
  }, []);

  const loadManagers = async () => {
    try {
      const res = await fetch(`${MANAGERS_URL}?status=authorized`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setManagers(Array.isArray(data) ? data : data.managers || []);
      }
    } catch {
      /* список менеджеров не критичен */
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch(SETTINGS_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLockNonNew(data.lock_non_new_orders === "true");
        setRecalcOnlyNew(data.recalc_only_new === "true");
        try {
          const ids = JSON.parse(data.recalc_allowed_users || "[]");
          setRecalcAllowedUsers(Array.isArray(ids) ? ids : []);
        } catch {
          setRecalcAllowedUsers([]);
        }
      }
    } catch {
      toast({ title: "Ошибка загрузки настроек", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateSettingRaw = async (key: string, value: string) => {
    setSaving(true);
    try {
      const res = await fetch(SETTINGS_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Сохранено" });
    } catch {
      toast({ title: "Не удалось сохранить", variant: "destructive" });
      loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: boolean) =>
    updateSettingRaw(key, value ? "true" : "false");

  const handleLockToggle = (checked: boolean) => {
    setLockNonNew(checked);
    updateSetting("lock_non_new_orders", checked);
  };

  const handleRecalcOnlyNew = (checked: boolean) => {
    setRecalcOnlyNew(checked);
    updateSetting("recalc_only_new", checked);
  };

  const toggleAllowedUser = (phone: string, checked: boolean) => {
    const next = checked
      ? [...recalcAllowedUsers, phone]
      : recalcAllowedUsers.filter((u) => u !== phone);
    setRecalcAllowedUsers(next);
    updateSettingRaw("recalc_allowed_users", JSON.stringify(next));
  };

  const managerName = (m: ManagerItem) =>
    `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.phone;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => navigate("/admin/dashboard")}
            >
              <Icon name="ArrowLeft" size={16} />
            </Button>
            <h1 className="text-lg sm:text-xl font-semibold">Настройки</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {loading ? (
          <p className="text-muted-foreground">Загрузка...</p>
        ) : (
          <Tabs defaultValue="orders">
            <TabsList>
              <TabsTrigger value="orders">Заявки</TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="mt-6 space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.08] bg-card">
                <Checkbox
                  id="lock-non-new"
                  checked={lockNonNew}
                  disabled={saving}
                  onCheckedChange={(c) => handleLockToggle(c === true)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label htmlFor="lock-non-new" className="font-medium cursor-pointer">
                    Блокировать не Новые заявки у менеджеров
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Если включено — менеджеры не смогут редактировать список товаров,
                    количество и цены в заявках со статусом «Подтверждена», «Отгружена»,
                    «Завершена» и «Архив». Комментарий и смена статуса остаются доступными.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/[0.08] bg-card space-y-4">
                <div>
                  <p className="font-medium">Пересчёт цен</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Кнопка «Пересчёт цен» в заявке позволяет массово обновить цены по группе
                    или бренду товаров. Владельцу доступна всегда.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="recalc-only-new"
                    checked={recalcOnlyNew}
                    disabled={saving}
                    onCheckedChange={(c) => handleRecalcOnlyNew(c === true)}
                    className="mt-1"
                  />
                  <Label htmlFor="recalc-only-new" className="font-medium cursor-pointer flex-1">
                    Показывать кнопку только для Новых заявок
                  </Label>
                </div>

                <div>
                  <p className="font-medium mb-2">Менеджеры, которым доступна кнопка</p>
                  {managers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет авторизованных менеджеров</p>
                  ) : (
                    <div className="space-y-2">
                      {managers.map((m) => (
                        <div key={m.id} className="flex items-center gap-3">
                          <Checkbox
                            id={`recalc-user-${m.id}`}
                            checked={recalcAllowedUsers.includes(m.phone)}
                            disabled={saving}
                            onCheckedChange={(c) => toggleAllowedUser(m.phone, c === true)}
                          />
                          <Label
                            htmlFor={`recalc-user-${m.id}`}
                            className="cursor-pointer flex-1"
                          >
                            {managerName(m)}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default OwnerSettings;