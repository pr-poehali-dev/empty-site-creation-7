import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import DebugToggle from "@/components/DebugToggle";
import DebugBadge from "@/components/DebugBadge";

const TELEGRAM_SETUP_URL = "https://functions.poehali.dev/6db3cf7c-812a-4ed9-94a2-5df8405a458c";
const TELEGRAM_WEBHOOK_URL = "https://functions.poehali.dev/c5134d29-4cd5-49a8-8385-f44995f8721e";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const { toast } = useToast();

  const [resettingWebhook, setResettingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<"loading" | "ok" | "error" | "unset">("loading");
  const [webhookError, setWebhookError] = useState<string>("");

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin");
      return;
    }
  }, []);

  const fetchWebhookStatus = useCallback(async () => {
    setWebhookStatus("loading");
    try {
      const resp = await fetch(`${TELEGRAM_SETUP_URL}/?action=webhook_info`);
      const data = await resp.json();
      if (!resp.ok) {
        setWebhookStatus("error");
        setWebhookError(data.error || "Ошибка запроса");
        return;
      }
      if (!data.url) {
        setWebhookStatus("unset");
        setWebhookError("Webhook не установлен");
        return;
      }
      if (data.last_error_message) {
        setWebhookStatus("error");
        setWebhookError(data.last_error_message);
        return;
      }
      setWebhookStatus("ok");
      setWebhookError("");
    } catch {
      setWebhookStatus("error");
      setWebhookError("Нет связи");
    }
  }, []);

  useEffect(() => {
    if (user.role === "owner") fetchWebhookStatus();
  }, [fetchWebhookStatus]);

  const handleResetWebhook = async () => {
    setResettingWebhook(true);
    try {
      const resp = await fetch(`${TELEGRAM_SETUP_URL}/?action=set_webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: TELEGRAM_WEBHOOK_URL }),
      });
      const data = await resp.json();
      if (resp.ok && (data.ok || data.result === true)) {
        toast({ title: "Telegram webhook переустановлен", description: "Бот готов принимать команды" });
        fetchWebhookStatus();
      } else {
        toast({
          title: "Ошибка",
          description: data.description || data.error || "Не удалось переустановить",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Ошибка сети", description: "Не удалось связаться с сервером", variant: "destructive" });
    } finally {
      setResettingWebhook(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/admin");
  };


  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <h1 className="text-lg sm:text-xl font-semibold">Мир Техники плюс</h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{user.phone}</span>
            <DebugToggle />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 hover:bg-white/[0.06] gap-2"
              onClick={handleResetWebhook}
              disabled={resettingWebhook}
              title={
                webhookStatus === "ok"
                  ? "Telegram webhook активен. Нажмите, чтобы переустановить"
                  : webhookStatus === "loading"
                  ? "Проверка статуса…"
                  : `Проблема: ${webhookError || "нажмите, чтобы переустановить"}`
              }
            >
              {resettingWebhook || webhookStatus === "loading" ? (
                <Icon name="Loader2" size={16} className="animate-spin" />
              ) : webhookStatus === "ok" ? (
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              ) : (
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              )}
              <span className="hidden sm:inline">Telegram</span>
              <Icon name="RefreshCw" size={14} className="opacity-60" />
            </Button>
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
          <DebugBadge id="Admin:nav.catalog" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/catalog")}
            >
              <Icon name="Package" size={20} />
              <span className="font-medium">Каталог</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.orders" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/orders")}
            >
              <Icon name="ClipboardList" size={20} />
              <span className="font-medium">Заявки</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.receipts" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/receipts")}
            >
              <Icon name="PackagePlus" size={20} />
              <span className="font-medium">Приёмки</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.returns" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/returns")}
            >
              <Icon name="Undo2" size={20} />
              <span className="font-medium">Возвраты</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.inventories" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/inventories")}
            >
              <Icon name="ClipboardCheck" size={20} />
              <span className="font-medium">Инвентаризации</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.labels" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/labels")}
            >
              <Icon name="Tag" size={20} />
              <span className="font-medium">Этикетки</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.settings" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/settings")}
            >
              <Icon name="Settings" size={20} />
              <span className="font-medium">Настройки</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.users" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/watumiaji")}
            >
              <Icon name="Users" size={20} />
              <span className="font-medium">Пользователи</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.backup" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/backup")}
            >
              <Icon name="DatabaseBackup" size={20} />
              <span className="font-medium">Архивация данных</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.exchange" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/exchange-1c")}
            >
              <Icon name="RefreshCw" size={20} />
              <span className="font-medium">Обмен с 1С</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.wholesalers" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/wholesalers")}
            >
              <Icon name="Users" size={20} />
              <span className="font-medium">Фирмы</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.pricing" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/pricing")}
            >
              <Icon name="Calculator" size={20} />
              <span className="font-medium">Определение цен</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.invoices" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/invoices")}
            >
              <Icon name="FileSpreadsheet" size={20} />
              <span className="font-medium">Загрузка счетов</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.instructions" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/instructions")}
            >
              <Icon name="BookOpen" size={20} />
              <span className="font-medium">Инструкции от Юры</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.newProducts" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-red-500/30 justify-start gap-3 text-red-400 hover:text-red-300 hover:border-red-500/50"
              onClick={() => navigate("/admin/new-products")}
            >
              <Icon name="PackagePlus" size={20} />
              <span className="font-medium">Новые товары</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.newBarcodes" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-red-500/30 justify-start gap-3 text-red-400 hover:text-red-300 hover:border-red-500/50"
              onClick={() => navigate("/admin/new-barcodes")}
            >
              <Icon name="ScanLine" size={20} />
              <span className="font-medium">Новые штрихкоды</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.brands" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/brands")}
            >
              <Icon name="Tag" size={20} />
              <span className="font-medium">Бренды</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.groups" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/product-groups")}
            >
              <Icon name="FolderTree" size={20} />
              <span className="font-medium">Группы</span>
            </Button>
          </DebugBadge>
          <DebugBadge id="Admin:nav.auctions" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/auctions")}
            >
              <Icon name="Gavel" size={20} />
              <span className="font-medium">Аукционы</span>
            </Button>
          </DebugBadge>

          <DebugBadge id="Admin:nav.scheduler" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/scheduler")}
            >
              <Icon name="AlarmClock" size={20} />
              <span className="font-medium">Толкатель</span>
            </Button>
          </DebugBadge>

          <DebugBadge id="Admin:nav.messageServer" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
              onClick={() => navigate("/admin/message-server")}
            >
              <Icon name="Send" size={20} />
              <span className="font-medium">Сервер сообщений</span>
            </Button>
          </DebugBadge>
        </div>

      </main>
</div>
  );
};

export default AdminDashboard;