import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const MSG_URL = "https://functions.poehali.dev/5196ad48-3bd4-4763-bb20-ca8c9b91b508";

interface Settings {
  rate_per_second: number;
  max_attempts: number;
  retry_pause_seconds: number;
  per_user_per_minute: number;
  enabled: boolean;
}

interface Stats {
  ready: number;
  deferred: number;
  errors: number;
  sent: number;
}

interface QueueItem {
  id: number;
  address: string;
  text: string;
  status: string;
  attempts: number;
  error: string | null;
  sent_at: string | null;
  source: string | null;
  status_text?: string | null;
  tg_code?: number | null;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "в очереди", cls: "text-sky-300" },
  sent: { text: "отправлено", cls: "text-emerald-400" },
  error: { text: "ошибка", cls: "text-rose-400" },
  cancelled: { text: "отменено", cls: "text-muted-foreground" },
};

const OwnerMessageServer = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";

  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin");
      return;
    }
    loadAll();
  }, []);

  const api = async (action: string, opts: RequestInit = {}) => {
    const res = await fetch(`${MSG_URL}?action=${action}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка");
    return data;
  };

  const loadAll = async () => {
    try {
      const [s, st, list] = await Promise.all([
        api("settings"),
        api("stats"),
        api(`list&status=${filter}`),
      ]);
      setSettings(s);
      setStats(st);
      setItems(list.items || []);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const refreshMonitor = async (nextFilter?: string) => {
    const f = nextFilter ?? filter;
    try {
      const [st, list] = await Promise.all([api("stats"), api(`list&status=${f}`)]);
      setStats(st);
      setItems(list.items || []);
    } catch {
      /* ignore */
    }
  };

  const saveSetting = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setBusy(true);
    try {
      const saved = await api("settings", {
        method: "PUT",
        body: JSON.stringify({ settings: patch }),
      });
      setSettings(saved);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const retryErrors = async () => {
    setBusy(true);
    try {
      await api("retry", { method: "POST", body: JSON.stringify({}) });
      toast({ title: "Сбойные поставлены в очередь заново" });
      refreshMonitor();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancelItem = async (id: number) => {
    setBusy(true);
    try {
      await api("cancel", { method: "POST", body: JSON.stringify({ id }) });
      refreshMonitor();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const changeFilter = (f: string) => {
    setFilter(f);
    refreshMonitor(f);
  };

  const numField = (
    label: string,
    hint: string,
    key: keyof Settings,
    min: number,
    max: number
  ) => (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <Input
        type="number"
        min={min}
        max={max}
        defaultValue={settings ? (settings[key] as number) : 0}
        disabled={busy}
        onBlur={(e) => {
          const v = Math.max(min, Math.min(max, parseInt(e.target.value) || min));
          if (settings && v !== settings[key]) saveSetting({ [key]: v } as Partial<Settings>);
        }}
        className="h-9 w-24 shrink-0"
      />
    </div>
  );

  const filters = [
    { key: "all", label: "Все" },
    { key: "pending", label: "В очереди" },
    { key: "error", label: "Ошибки" },
    { key: "sent", label: "Отправлено" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate("/admin/dashboard")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg sm:text-xl font-semibold">Сервер сообщений</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4">
        {loading || !settings ? (
          <p className="text-muted-foreground">Загрузка…</p>
        ) : (
          <>
            {/* Стоп-кран */}
            <div className="rounded-xl border border-white/[0.08] bg-card p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Рассылка включена</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Общий стоп-кран. Выключите — и сервер перестанет отправлять сообщения
                  (они останутся ждать в очереди).
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                disabled={busy}
                onCheckedChange={(c) => saveSetting({ enabled: c })}
              />
            </div>

            {/* Монитор */}
            <div className="rounded-xl border border-white/[0.08] bg-card p-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-2xl font-semibold text-sky-300">{stats?.ready ?? 0}</p>
                  <p className="text-xs text-muted-foreground">в очереди</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-amber-300">{stats?.deferred ?? 0}</p>
                  <p className="text-xs text-muted-foreground">отложено</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-rose-400">{stats?.errors ?? 0}</p>
                  <p className="text-xs text-muted-foreground">ошибок</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-emerald-400">{stats?.sent ?? 0}</p>
                  <p className="text-xs text-muted-foreground">отправлено</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => refreshMonitor()}>
                  <Icon name="RefreshCw" size={14} />
                  Обновить
                </Button>
                {(stats?.errors ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={retryErrors}
                    className="gap-1.5 h-8"
                  >
                    <Icon name="RotateCcw" size={14} />
                    Переотправить сбойные
                  </Button>
                )}
              </div>
            </div>

            {/* Настройки */}
            <div className="rounded-xl border border-white/[0.08] bg-card p-4 divide-y divide-white/[0.06]">
              <p className="font-medium text-sm pb-2">Настройки Telegram</p>
              {numField(
                "Скорость отправки",
                "Сколько сообщений в секунду (до 30), чтобы не упереться в лимит Telegram.",
                "rate_per_second",
                1,
                30
              )}
              {numField(
                "Повторов при сбое",
                "Сколько раз пробовать отправить снова, если не получилось.",
                "max_attempts",
                1,
                10
              )}
              {numField(
                "Пауза перед повтором",
                "Сколько секунд ждать перед повторной попыткой.",
                "retry_pause_seconds",
                1,
                300
              )}
              {numField(
                "Лимит на одного в минуту",
                "Не больше N сообщений одному получателю за минуту (защита от спама).",
                "per_user_per_minute",
                1,
                60
              )}
            </div>

            {/* Лог */}
            <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">Последние сообщения</p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {filters.map((f) => (
                  <Button
                    key={f.key}
                    variant={filter === f.key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => changeFilter(f.key)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Пусто.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it) => {
                    const st = STATUS_LABEL[it.status] || { text: it.status, cls: "" };
                    return (
                      <div
                        key={it.id}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground text-xs">
                            #{it.id} · {it.address}
                            {it.source && <> · {it.source}</>}
                          </span>
                          <span className={`text-xs font-medium ${st.cls}`}>{st.text}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-muted-foreground/90">{it.text}</p>
                        {it.status_text && (
                          <p className={`mt-1 text-xs font-medium ${st.cls}`}>
                            {it.status_text}
                          </p>
                        )}
                        {(it.status === "error" || it.attempts > 0) && it.error && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground/60 break-all">
                            Ответ Telegram{it.tg_code ? ` (${it.tg_code})` : ""}: {it.error}
                          </p>
                        )}
                        {it.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => cancelItem(it.id)}
                            className="mt-1 h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          >
                            Отменить
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default OwnerMessageServer;