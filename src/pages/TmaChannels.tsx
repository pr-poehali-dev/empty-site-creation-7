import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";

const CHANNELS_URL = "https://functions.poehali.dev/8e2deea6-70cc-4832-a1c0-b1cbc4ad1f2d";

interface Channel {
  id?: number;
  chat_id: number;
  title: string | null;
  username: string | null;
}

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}

const getTg = (): TgWebApp | undefined =>
  (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

const TmaChannels = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState("");
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [discovered, setDiscovered] = useState<Channel[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [addingChat, setAddingChat] = useState<number | null>(null);

  const initData = () => getTg()?.initData || "";

  const discover = async () => {
    setDiscovering(true);
    setError("");
    try {
      const resp = await fetch(CHANNELS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData(), action: "discover" }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Не удалось найти каналы");
        return;
      }
      setDiscovered(data.discovered || []);
    } catch {
      setError("Ошибка соединения.");
    } finally {
      setDiscovering(false);
    }
  };

  const addByChatId = async (ch: Channel) => {
    setAddingChat(ch.chat_id);
    setError("");
    try {
      const resp = await fetch(CHANNELS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData(), action: "add_discovered", chat_id: ch.chat_id }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Не удалось добавить канал");
        return;
      }
      setDiscovered((prev) => prev.filter((c) => c.chat_id !== ch.chat_id));
      await load();
    } catch {
      setError("Ошибка соединения.");
    } finally {
      setAddingChat(null);
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
    try {
      const resp = await fetch(`${CHANNELS_URL}?init_data=${encodeURIComponent(initData())}`);
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Нет доступа.");
        setLoading(false);
        return;
      }
      setChannels(data.channels || []);
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
      const s = document.createElement("script");
      s.src = "https://telegram.org/js/telegram-web-app.js";
      s.async = true;
      s.onload = () => load();
      s.onerror = () => {
        setError("Откройте приложение из бота.");
        setLoading(false);
      };
      document.body.appendChild(s);
    }
     
  }, []);

  const add = async () => {
    if (!value.trim()) return;
    setAdding(true);
    setError("");
    try {
      const resp = await fetch(CHANNELS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData(), action: "add", channel: value.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Не удалось добавить канал");
        setAdding(false);
        return;
      }
      setValue("");
      await load();
    } catch {
      setError("Ошибка соединения.");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (ch: Channel) => {
    if (!window.confirm(`Отключить канал «${ch.title || ch.chat_id}»?`)) return;
    try {
      const resp = await fetch(CHANNELS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData(), action: "remove", channel_id: ch.id }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        window.alert(data.error || "Не удалось отключить");
        return;
      }
      await load();
    } catch {
      window.alert("Ошибка соединения.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-6 flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/tma/cabinet")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <h1 className="text-xl font-bold">Каналы</h1>
      </div>

      <div className="max-w-md w-full mx-auto flex flex-col gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <label className="text-sm text-muted-foreground mb-2 block">
            Добавить канал (@username или ID)
          </label>
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="@my_channel"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 outline-none"
            />
            <button
              onClick={add}
              disabled={adding}
              className="rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60 flex items-center gap-1"
            >
              {adding ? <Icon name="Loader2" size={18} className="animate-spin" /> : <Icon name="Plus" size={18} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Сначала добавьте бота администратором канала.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <button
            onClick={discover}
            disabled={discovering}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 font-medium disabled:opacity-60"
          >
            {discovering ? (
              <Icon name="Loader2" size={18} className="animate-spin" />
            ) : (
              <Icon name="Search" size={18} />
            )}
            Найти мои каналы
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            Назначьте бота администратором канала — и он появится здесь.
          </p>

          {discovered.length > 0 && (
            <div className="flex flex-col gap-2 mt-3">
              {discovered.map((ch) => (
                <div
                  key={ch.chat_id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                >
                  <Icon name="Radio" size={18} className="text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{ch.title || `Канал ${ch.chat_id}`}</div>
                    {ch.username && (
                      <div className="text-xs text-muted-foreground">@{ch.username}</div>
                    )}
                  </div>
                  <button
                    onClick={() => addByChatId(ch)}
                    disabled={addingChat === ch.chat_id}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 flex items-center gap-1"
                  >
                    {addingChat === ch.chat_id ? (
                      <Icon name="Loader2" size={14} className="animate-spin" />
                    ) : (
                      "Добавить"
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading && (
          <div className="flex justify-center py-10">
            <Icon name="Loader2" size={26} className="animate-spin opacity-70" />
          </div>
        )}

        {!loading && channels.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Icon name="Radio" size={32} />
            <p className="max-w-xs text-sm">Пока нет каналов. Добавьте первый.</p>
          </div>
        )}

        {channels.map((ch) => (
          <div key={ch.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Icon name="Send" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{ch.title || `Канал ${ch.chat_id}`}</div>
              {ch.username && <div className="text-sm text-muted-foreground">@{ch.username}</div>}
            </div>
            <button
              onClick={() => remove(ch)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground"
            >
              <Icon name="Trash2" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TmaChannels;