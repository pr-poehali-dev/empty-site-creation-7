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
  published_count?: number;
}

interface Channel {
  id: number;
  chat_id: number;
  title: string | null;
  username: string | null;
}

const CHANNELS_URL = "https://functions.poehali.dev/8e2deea6-70cc-4832-a1c0-b1cbc4ad1f2d";

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
  const [selected, setSelected] = useState<Lot | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [picked, setPicked] = useState<number[]>([]);

  const initData = () => getTg()?.initData || "";

  const openPublish = async (lot: Lot) => {
    setSelected(null);
    setPublishing(true);
    setPicked([]);
    setChannels([]);
    try {
      const resp = await fetch(`${CHANNELS_URL}?init_data=${encodeURIComponent(initData())}`);
      const data = await resp.json();
      if (resp.ok) setChannels(data.channels || []);
    } catch {
      /* ignore */
    }
    setSelected(lot);
  };

  const publish = async (lot: Lot) => {
    if (picked.length === 0) {
      window.alert("Выберите хотя бы один канал");
      return;
    }
    setBusy(true);
    try {
      const resp = await fetch(LOTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: initData(),
          action: "publish",
          lot_id: lot.id,
          channel_ids: picked,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        window.alert(data.error || "Не удалось опубликовать");
        setBusy(false);
        return;
      }
      window.alert(`Опубликовано в ${data.published} канал(ах)`);
      setPublishing(false);
      setSelected(null);
      await load();
    } catch {
      window.alert("Ошибка соединения.");
    } finally {
      setBusy(false);
    }
  };

  const action = async (act: "cancel" | "delete", lot: Lot) => {
    const tg = getTg();
    const initData = tg?.initData || "";
    if (act === "delete" && !window.confirm("Удалить лот навсегда? Действие необратимо.")) return;
    setBusy(true);
    try {
      const resp = await fetch(LOTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData, action: act, lot_id: lot.id }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        window.alert(data.error || "Не удалось выполнить действие");
        setBusy(false);
        return;
      }
      setSelected(null);
      await load();
    } catch {
      window.alert("Ошибка соединения.");
    } finally {
      setBusy(false);
    }
  };

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

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => navigate("/tma/lot/new")}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground"
        >
          <Icon name="Plus" size={20} />
          Новый лот
        </button>
        <button
          onClick={() => navigate("/tma/channels")}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-4 font-medium"
        >
          <Icon name="Send" size={18} />
          Каналы
        </button>
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
          <Icon name="Package" size={36} className="text-muted-foreground" />
          <p className="text-muted-foreground max-w-xs">Пока нет лотов. Создайте первый.</p>
        </div>
      )}

      {!loading && !error && lots.length > 0 && (
        <div className="flex flex-col gap-3 max-w-md w-full mx-auto">
          {lots.map((lot) => (
            <button
              key={lot.id}
              onClick={() => setSelected(lot)}
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
                  {lot.desired_price.toLocaleString("ru-RU")} ₽ · остаток {lot.quantity_left}/{lot.quantity}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                    {STATUS_LABEL[lot.status] || lot.status}
                  </span>
                  {lot.ends_at && (
                    <span className="text-muted-foreground">до {formatDate(lot.ends_at)}</span>
                  )}
                  {!!lot.published_count && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Icon name="Send" size={11} />
                      {lot.published_count}
                    </span>
                  )}
                </div>
              </div>
              <Icon name="ChevronRight" size={18} className="self-center text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => {
            if (busy) return;
            setPublishing(false);
            setSelected(null);
          }}
        >
          <div
            className="w-full rounded-t-3xl bg-card p-5 pb-8 max-w-md mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="font-semibold text-lg mb-1 truncate">{selected.title}</div>
            <div className="text-sm text-muted-foreground mb-5">
              {STATUS_LABEL[selected.status] || selected.status}
            </div>

            {!publishing && (
              <div className="flex flex-col gap-2">
                {selected.status === "active" && (
                  <button
                    onClick={() => navigate(`/tma/lot/${selected.id}/edit`)}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground"
                  >
                    <Icon name="Pencil" size={18} />
                    Редактировать
                  </button>
                )}
                {selected.status === "active" && (
                  <button
                    onClick={() => openPublish(selected)}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 py-3.5 font-medium"
                  >
                    <Icon name="Send" size={18} />
                    Опубликовать в канал
                  </button>
                )}
                {selected.status === "active" && (
                  <button
                    disabled={busy}
                    onClick={() => action("cancel", selected)}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 py-3.5 font-medium disabled:opacity-60"
                  >
                    <Icon name="Ban" size={18} />
                    Отменить лот
                  </button>
                )}
                {(selected.status === "cancelled" || selected.status === "finished") && (
                  <button
                    disabled={busy}
                    onClick={() => action("delete", selected)}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-3.5 font-medium text-red-400 disabled:opacity-60"
                  >
                    <Icon name="Trash2" size={18} />
                    Удалить окончательно
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => setSelected(null)}
                  className="flex items-center justify-center rounded-2xl px-5 py-3 text-muted-foreground"
                >
                  Закрыть
                </button>
              </div>
            )}

            {publishing && (
              <div className="flex flex-col gap-2">
                <div className="text-sm text-muted-foreground mb-1">Выберите каналы:</div>
                {channels.length === 0 && (
                  <div className="rounded-2xl border border-border bg-background p-4 text-center text-sm text-muted-foreground">
                    Нет подключённых каналов.{" "}
                    <button className="text-primary underline" onClick={() => navigate("/tma/channels")}>
                      Добавить
                    </button>
                  </div>
                )}
                <div className="max-h-60 overflow-y-auto flex flex-col gap-2">
                  {channels.map((ch) => {
                    const on = picked.includes(ch.id);
                    return (
                      <button
                        key={ch.id}
                        onClick={() =>
                          setPicked((p) => (on ? p.filter((x) => x !== ch.id) : [...p, ch.id]))
                        }
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${
                          on ? "border-primary bg-primary/10" : "border-border bg-background"
                        }`}
                      >
                        <Icon
                          name={on ? "CheckSquare" : "Square"}
                          size={18}
                          className={on ? "text-primary" : "text-muted-foreground"}
                        />
                        <span className="flex-1 truncate">{ch.title || `Канал ${ch.chat_id}`}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  disabled={busy || picked.length === 0}
                  onClick={() => publish(selected)}
                  className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy && <Icon name="Loader2" size={18} className="animate-spin" />}
                  Опубликовать
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setPublishing(false);
                    setSelected(null);
                  }}
                  className="flex items-center justify-center rounded-2xl px-5 py-3 text-muted-foreground"
                >
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TmaCabinet;