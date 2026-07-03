import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";

const AUCTION_ME_URL = "https://functions.poehali.dev/ba801f3a-94dd-46a8-9d24-a830a5ff56aa";

type Role = "admin" | "operator" | "buyer" | "denied";

interface MeResponse {
  role: Role;
  is_staff: boolean;
  name: string;
  telegram_id?: number;
  error?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        colorScheme?: string;
      };
    };
  }
}

const TmaHome = () => {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => init();
    script.onerror = () => {
      setError("Откройте эту страницу из Telegram-бота.");
      setLoading(false);
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
     
  }, []);

  const init = async () => {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setError("Откройте эту страницу из Telegram-бота.");
      setLoading(false);
      return;
    }
    tg.ready();
    tg.expand();

    const initData = tg.initData || "";
    if (!initData) {
      setError("Не удалось получить данные Telegram. Откройте приложение из бота.");
      setLoading(false);
      return;
    }

    try {
      const resp = await fetch(AUCTION_ME_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData }),
      });
      const data: MeResponse = await resp.json();
      if (!resp.ok || data.role === "denied") {
        setError(data.error || "Доступ не выдан.");
        setLoading(false);
        return;
      }
      setMe(data);
    } catch (e) {
      setError("Ошибка соединения. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <Icon name="Loader2" size={32} className="animate-spin opacity-70" />
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6 gap-3 text-center">
        <Icon name="ShieldAlert" size={40} className="text-muted-foreground" />
        <p className="text-muted-foreground max-w-xs">{error || "Доступ не выдан."}</p>
      </div>
    );
  }

  const isStaff = me.is_staff;

  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-8 flex flex-col">
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">Аукцион</p>
        <h1 className="text-2xl font-bold">Привет, {me.name}!</h1>
      </div>

      <div className="flex flex-col gap-3 max-w-md w-full mx-auto">
        {isStaff && (
          <button
            className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition hover:bg-white/[0.04]"
            onClick={() => alert("Кабинет аукциона — скоро")}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Icon name="LayoutDashboard" size={22} />
            </div>
            <div>
              <div className="font-semibold">Кабинет аукциона</div>
              <div className="text-sm text-muted-foreground">
                {me.role === "admin" ? "Лоты, ставки, управление" : "Создание и публикация лотов"}
              </div>
            </div>
          </button>
        )}

        <button
          className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition hover:bg-white/[0.04]"
          onClick={() => alert("Витрина аукциона — скоро")}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Icon name="Gavel" size={22} />
          </div>
          <div>
            <div className="font-semibold">Участвовать</div>
            <div className="text-sm text-muted-foreground">Смотреть лоты и делать ставки</div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default TmaHome;
