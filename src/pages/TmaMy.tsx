import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";

const BUYER_URL = "https://functions.poehali.dev/cef9517b-3f37-4b8b-be1c-5d94827ca738";

interface MyLot {
  id: number;
  title: string;
  desired_price: number;
  status: string;
  ends_at: string | null;
  photo_urls: string[];
  my_bid: number;
}

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}

const getTg = (): TgWebApp | undefined =>
  (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

const TmaMy = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lots, setLots] = useState<MyLot[]>([]);

  const load = useCallback(async () => {
    const tg = getTg();
    if (!tg) {
      setError("Откройте приложение из бота.");
      setLoading(false);
      return;
    }
    tg.ready();
    tg.expand();
    if (!tg.initData) {
      setError("Не удалось получить данные Telegram.");
      setLoading(false);
      return;
    }
    try {
      const resp = await fetch(
        `${BUYER_URL}?action=my_bids&init_data=${encodeURIComponent(tg.initData)}`
      );
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
  }, []);

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
  }, [load]);

  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-6 flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/tma")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <h1 className="text-xl font-bold">Мои лоты</h1>
      </div>

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
          <Icon name="Gavel" size={36} className="text-muted-foreground" />
          <p className="text-muted-foreground max-w-xs">
            Вы ещё не участвовали в лотах. Откройте лот из канала и сделайте ставку.
          </p>
        </div>
      )}

      {!loading && !error && lots.length > 0 && (
        <div className="flex flex-col gap-3 max-w-md w-full mx-auto">
          {lots.map((lot) => (
            <button
              key={lot.id}
              onClick={() => navigate(`/tma/buy/${lot.id}`)}
              className="flex gap-3 rounded-2xl border border-border bg-card p-3 text-left w-full"
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
                  Начальная: {lot.desired_price.toLocaleString("ru-RU")} ₽
                </div>
                <div className="text-sm text-primary font-medium">
                  Ваша ставка: {lot.my_bid.toLocaleString("ru-RU")} ₽
                </div>
              </div>
              <Icon name="ChevronRight" size={18} className="text-muted-foreground self-center" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TmaMy;
