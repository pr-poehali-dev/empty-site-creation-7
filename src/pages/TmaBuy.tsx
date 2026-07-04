import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "@/components/ui/icon";

const BUYER_URL = "https://functions.poehali.dev/cef9517b-3f37-4b8b-be1c-5d94827ca738";

interface Lot {
  id: number;
  title: string;
  description: string | null;
  desired_price: number;
  quantity: number;
  quantity_left: number;
  status: string;
  ends_at: string | null;
  photo_urls: string[];
  open: boolean;
  my_bid: number | null;
}

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}

const getTg = (): TgWebApp | undefined =>
  (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

const formatEnds = (iso: string | null) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const TmaBuy = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lot, setLot] = useState<Lot | null>(null);
  const [busy, setBusy] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [photoIdx, setPhotoIdx] = useState(0);

  const initData = () => getTg()?.initData || "";

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
        `${BUYER_URL}?lot_id=${id}&init_data=${encodeURIComponent(tg.initData)}`
      );
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Лот не найден.");
        setLoading(false);
        return;
      }
      setLot(data.lot);
    } catch {
      setError("Ошибка соединения.");
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  useEffect(() => {
    if (!lot?.open) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [lot?.open, load]);

  const submit = async (action: "buy_now" | "place_bid") => {
    if (!lot) return;
    let price: number | undefined;
    if (action === "place_bid") {
      price = Number(priceInput);
      if (!price || price <= 0) {
        window.alert("Введите вашу цену");
        return;
      }
      if (price > lot.desired_price) {
        window.alert("Цена не может быть выше начальной");
        return;
      }
    }
    setBusy(true);
    try {
      const resp = await fetch(BUYER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData(), action, lot_id: lot.id, price }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        window.alert(data.error || "Не удалось выполнить.");
        setBusy(false);
        return;
      }
      setLot(data.lot);
      setPriceInput("");
      window.alert(action === "buy_now" ? "Вы забрали по начальной цене!" : "Ставка принята!");
    } catch {
      window.alert("Ошибка соединения.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <Icon name="Loader2" size={30} className="animate-spin opacity-70" />
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      </div>
    );
  }

  if (error || !lot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6 gap-3 text-center">
        <Icon name="PackageX" size={38} className="text-muted-foreground" />
        <p className="text-muted-foreground max-w-xs">{error || "Лот не найден."}</p>
        <button
          onClick={() => navigate("/tma/my")}
          className="mt-2 rounded-xl border border-border bg-card px-4 py-2 text-sm"
        >
          Мои лоты
        </button>
      </div>
    );
  }

  const photos = lot.photo_urls || [];
  const cover = photos[photoIdx];

  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-6 flex flex-col">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate("/tma/my")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <h1 className="text-lg font-bold truncate">{lot.title}</h1>
      </div>

      <div className="max-w-md w-full mx-auto flex flex-col gap-4">
        <div className="aspect-square w-full rounded-2xl overflow-hidden bg-white/[0.04] flex items-center justify-center">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name="Image" size={40} className="text-muted-foreground" />
          )}
        </div>

        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {photos.map((p, i) => (
              <button
                key={i}
                onClick={() => setPhotoIdx(i)}
                className={`h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden border ${
                  i === photoIdx ? "border-primary" : "border-border"
                }`}
              >
                <img src={p} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {lot.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lot.description}</p>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Начальная цена</span>
            <span className="font-bold text-lg">
              {lot.desired_price.toLocaleString("ru-RU")} ₽
            </span>
          </div>
          {lot.ends_at && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">До</span>
              <span className="text-sm">{formatEnds(lot.ends_at)}</span>
            </div>
          )}
          {lot.my_bid !== null && (
            <div className="flex items-center justify-between border-t border-border pt-2 mt-1">
              <span className="text-sm text-muted-foreground">Ваша ставка</span>
              <span className="font-semibold text-primary">
                {lot.my_bid.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          )}
        </div>

        {lot.open ? (
          <>
            <button
              disabled={busy}
              onClick={() => submit("buy_now")}
              className="w-full rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground disabled:opacity-50"
            >
              Забрать по начальной цене
            </button>

            <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
              <span className="text-sm font-medium">Предложить свою цену</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="Ваша цена, ₽"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
                />
                <button
                  disabled={busy}
                  onClick={() => submit("place_bid")}
                  className="flex-shrink-0 whitespace-nowrap rounded-xl border border-primary bg-primary/15 px-5 py-3 font-medium text-primary disabled:opacity-50"
                >
                  {lot.my_bid !== null ? "Изменить" : "Предложить"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4 text-center text-muted-foreground text-sm">
            Аукцион завершён — ставки закрыты.
          </div>
        )}
      </div>
    </div>
  );
};

export default TmaBuy;