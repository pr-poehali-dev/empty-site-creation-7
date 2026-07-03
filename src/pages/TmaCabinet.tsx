import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";

const LOTS_URL = "https://functions.poehali.dev/ccf1033f-bcff-4801-a6dc-8597eec21344";

interface Lot {
  id: number;
  title: string;
  desired_price: number;
  quantity: number;
  quantity_left: number;
  status: string;
  ends_at: string | null;
  photo_urls: string[];
}

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}

const getTg = (): TgWebApp | undefined =>
  (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

const STATUS_LABEL: Record<string, string> = {
  active: "Идёт",
  closed: "Закрыт",
  payment: "На оплате",
  finished: "Завершён",
  cancelled: "Отменён",
};

const formatDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const TmaCabinet = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<Lot[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    const tg = getTg();
    if (!tg) {
      setError("Откройте приложение из бота.");
      setLoading(false);
      return;
    }
    tg.ready();
    tg.expand();
    const initData = tg.initData || "";
    if (!initData) {
      setError("Не удалось получить данные Telegram.");
      setLoading(false);
      return;
    }
    try {
      const resp = await fetch(`${LOTS_URL}?init_data=${encodeURIComponent(initData)}`, {
        method: "GET",
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Нет доступа.");
        setLoading(false);
        return;
      }
      setLots(data.lots || []);
    } catch {
      setError("Ошибка соединения.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const tg = getTg();
    if (tg) {
      load();
    } else {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.async = true;
      script.onload = () => load();
      script.onerror = () => {
        setError("Откройте приложение из бота.");
        setLoading(false);
      };
      document.body.appendChild(script);
    }
     
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-6 flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/tma")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <h1 className="text-xl font-bold">Кабинет аукциона</h1>
      </div>

      <button
        onClick={() => navigate("/tma/lot/new")}
        className="mb-5 w-full flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground"
      >
        <Icon name="Plus" size={20} />
        Новый лот
      </button>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Icon name="Loader2" size={28} className="animate-spin opacity-70" />
          <p className="text-muted-foreground text-sm">Загрузка…</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Icon name="ShieldAlert" size={36} className="text-muted-foreground" />
          <p className="text-muted-foreground max-w-xs">{error}</p>
        </div>
      )}

      {!loading && !error && lots.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Icon name="Package" size={36} className="text-muted-foreground" />
          <p className="text-muted-foreground max-w-xs">Пока нет лотов. Создайте первый.</p>
        </div>
      )}

      {!loading && !error && lots.length > 0 && (
        <div className="flex flex-col gap-3 max-w-md w-full mx-auto">
          {lots.map((lot) => (
            <div
              key={lot.id}
              className="flex gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <div className="h-16 w-16 flex-shrink-0 rounded-xl overflow-hidden bg-white/[0.04] flex items-center justify-center">
                {lot.photo_urls[0] ? (
                  <img src={lot.photo_urls[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="Image" size={22} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{lot.title}</div>
                <div className="text-sm text-muted-foreground">
                  {lot.desired_price.toLocaleString("ru-RU")} ₽ · остаток {lot.quantity_left}/{lot.quantity}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                    {STATUS_LABEL[lot.status] || lot.status}
                  </span>
                  {lot.ends_at && (
                    <span className="text-muted-foreground">до {formatDate(lot.ends_at)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TmaCabinet;
