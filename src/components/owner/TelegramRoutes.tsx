import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const AUTH_URL = "https://functions.poehali.dev/4a2cb8d4-f9ea-4107-a828-aced0209a15e";
const SETTINGS_URL = "https://functions.poehali.dev/82a95791-7a9f-4f40-8167-eb96c3045d34";

interface RouteReport {
  route: string;
  direct: boolean;
  ok: boolean;
  bot?: string;
  error?: string;
  ms: number;
}

const MODES = [
  { value: "direct", label: "Напрямую", hint: "Без посредников, как раньше" },
  { value: "proxy", label: "Через посредника", hint: "Сразу в обход" },
  { value: "auto", label: "Автоматически", hint: "Пробует напрямую, при неудаче — в обход" },
];

export default function TelegramRoutes({ token }: { token: string }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("auto");
  const [proxies, setProxies] = useState<string[]>([]);
  const [newProxy, setNewProxy] = useState("");
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [report, setReport] = useState<RouteReport[] | null>(null);
  const [proxyKey, setProxyKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch(SETTINGS_URL, { headers: { "X-Authorization": `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setMode(d.tg_mode || "auto");
        const raw = (d.tg_proxies || "") as string;
        setProxies(raw.split(",").map((s) => s.trim()).filter(Boolean));
        setProxyKey(d.tg_proxy_key || "");
      })
      .catch(() => undefined);
  }, [token]);

  const save = async (key: string, value: string) => {
    setSaving(true);
    try {
      const resp = await fetch(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}` },
        body: JSON.stringify({ key, value }),
      });
      if (!resp.ok) {
        const d = await resp.json();
        toast({ title: "Ошибка", description: d.error, variant: "destructive" });
        return false;
      }
      return true;
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const changeMode = async (value: string) => {
    const prev = mode;
    setMode(value);
    if (!(await save("tg_mode", value))) setMode(prev);
  };

  const saveProxies = async (list: string[]) => {
    const prev = proxies;
    setProxies(list);
    if (!(await save("tg_proxies", list.join(",")))) setProxies(prev);
  };

  const addProxy = () => {
    const v = newProxy.trim().replace(/\/+$/, "");
    if (!v) return;
    if (!/^https?:\/\//.test(v)) {
      toast({ title: "Неверный адрес", description: "Адрес должен начинаться с https://", variant: "destructive" });
      return;
    }
    if (proxies.includes(v)) {
      toast({ title: "Уже в списке", variant: "destructive" });
      return;
    }
    saveProxies([...proxies, v]);
    setNewProxy("");
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= proxies.length) return;
    const list = [...proxies];
    [list[i], list[j]] = [list[j], list[i]];
    saveProxies(list);
  };

  const genKey = async () => {
    if (proxyKey && !confirm("Старый ключ перестанет работать. Новый нужно будет вписать в код посредника на Cloudflare. Продолжить?")) return;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const prev = proxyKey;
    setProxyKey(key);
    setShowKey(true);
    if (await save("tg_proxy_key", key)) {
      toast({ title: "Ключ создан", description: "Скопируйте его и вставьте в код посредника" });
    } else {
      setProxyKey(prev);
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(proxyKey);
      toast({ title: "Скопировано" });
    } catch {
      setShowKey(true);
      toast({ title: "Не удалось скопировать", description: "Выделите ключ вручную", variant: "destructive" });
    }
  };

  const probe = async () => {
    setProbing(true);
    setReport(null);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=tg_probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const d = await resp.json();
      if (resp.ok) {
        setReport(d.routes || []);
      } else {
        toast({ title: "Ошибка", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Проверка не удалась", variant: "destructive" });
    } finally {
      setProbing(false);
    }
  };

  const statusOf = (route: string) => report?.find((r) => r.route === route);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-white/[0.08] bg-card space-y-4">
        <div>
          <p className="font-medium">Режим связи с Telegram</p>
          <p className="text-sm text-muted-foreground mt-1">
            Определяет, как система отправляет коды и уведомления.
          </p>
        </div>
        <div className="space-y-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              disabled={saving}
              onClick={() => changeMode(m.value)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                mode === m.value
                  ? "border-primary/60 bg-primary/10"
                  : "border-white/[0.08] hover:bg-white/[0.04]"
              }`}
            >
              <Icon
                name={mode === m.value ? "CircleDot" : "Circle"}
                size={18}
                className={mode === m.value ? "text-primary mt-0.5" : "text-muted-foreground mt-0.5"}
              />
              <div>
                <div className="font-medium text-sm">{m.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{m.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/[0.08] bg-card space-y-3">
        <div>
          <p className="font-medium">Ключ посредника</p>
          <p className="text-sm text-muted-foreground mt-1">
            Общий пароль между сайтом и посредником. Одну и ту же строку нужно
            хранить здесь и вписать в код посредника на Cloudflare.
          </p>
        </div>

        {proxyKey ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                readOnly
                value={showKey ? proxyKey : "•".repeat(24)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-10 w-10 p-0"
                onClick={() => setShowKey((v) => !v)}
              >
                <Icon name={showKey ? "EyeOff" : "Eye"} size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-10 w-10 p-0"
                onClick={copyKey}
              >
                <Icon name="Copy" size={16} />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={genKey}
              className="text-muted-foreground"
            >
              <Icon name="RefreshCw" size={14} className="mr-1.5" />
              Сгенерировать заново
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Icon name="TriangleAlert" size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90">
                Ключ не задан. Связь через посредника работать не будет — только напрямую.
              </p>
            </div>
            <Button disabled={saving} onClick={genKey} className="w-full">
              <Icon name="Key" size={16} className="mr-2" />
              Сгенерировать ключ
            </Button>
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl border border-white/[0.08] bg-card space-y-4">
        <div>
          <p className="font-medium">Адреса посредников</p>
          <p className="text-sm text-muted-foreground mt-1">
            Система пробует их сверху вниз. Не ответил первый — берёт следующий.
            Упавший адрес откладывается на 10 минут, потом проверяется снова.
          </p>
        </div>

        {proxies.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Список пуст. Пока работает только прямая связь.
          </p>
        ) : (
          <div className="space-y-2">
            {proxies.map((p, i) => {
              const st = statusOf(p);
              return (
                <div
                  key={p}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-white/[0.06]"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || saving}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <Icon name="ChevronUp" size={14} />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === proxies.length - 1 || saving}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <Icon name="ChevronDown" size={14} />
                    </button>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      !st ? "bg-muted-foreground/40" : st.ok ? "bg-green-500" : "bg-destructive"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{p}</div>
                    {st && (
                      <div className="text-xs text-muted-foreground">
                        {st.ok ? `Работает, ${st.ms} мс` : st.error}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-8 w-8 p-0"
                    disabled={saving}
                    onClick={() => saveProxies(proxies.filter((x) => x !== p))}
                  >
                    <Icon name="Trash2" size={14} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Добавить адрес</Label>
          <div className="flex gap-2">
            <Input
              value={newProxy}
              onChange={(e) => setNewProxy(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addProxy()}
              placeholder="https://ваш-адрес.workers.dev"
              className="h-10"
            />
            <Button onClick={addProxy} disabled={!newProxy.trim() || saving} className="shrink-0">
              <Icon name="Plus" size={16} />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/[0.08] bg-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Проверка связи</p>
            <p className="text-sm text-muted-foreground mt-1">
              Пробует каждый путь и показывает, доходит ли сигнал до Telegram.
            </p>
          </div>
          <Button variant="outline" onClick={probe} disabled={probing} className="shrink-0">
            {probing ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              <Icon name="Activity" size={16} />
            )}
            <span className="ml-2">{probing ? "Проверяю..." : "Проверить"}</span>
          </Button>
        </div>

        {report && (
          <div className="space-y-2 pt-1">
            {report.map((r) => (
              <div
                key={r.route}
                className="flex items-center gap-2.5 py-2 border-b border-white/[0.06] last:border-0"
              >
                <Icon
                  name={r.ok ? "CheckCircle2" : "XCircle"}
                  size={16}
                  className={r.ok ? "text-green-500 shrink-0" : "text-destructive shrink-0"}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">
                    {r.direct ? "Напрямую в Telegram" : r.route}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.ok ? `Бот ${r.bot}, ответ за ${r.ms} мс` : r.error}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}