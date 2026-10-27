import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { vpsCall, type VpsState } from "@/lib/marketPrices";

const when = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const uptime = (sec?: number) => {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`;
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg bg-background/60 px-3 py-2">
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

const ACTIONS: { action: string; label: string; icon: string; confirm?: string }[] = [
  { action: "vps_ping", label: "Проверить связь", icon: "RefreshCw" },
  { action: "vps_restart", label: "Перезапустить браузер", icon: "RotateCcw" },
  {
    action: "vps_clear",
    label: "Очистить куки",
    icon: "Eraser",
    confirm: "Стереть сохранённые «пропуска» WB и Ozon? Проверку сайтов придётся проходить заново.",
  },
  { action: "vps_update", label: "Обновить программу", icon: "Download" },
];

const VpsSection = () => {
  const [st, setSt] = useState<VpsState | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async (action: string) => {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const d = await vpsCall(action);
      setSt((prev) => ({ ...d, command: d.command || prev?.command }));
      if (action === "vps_update") {
        setNotice("Программа обновляется, сервер перезапустится. Через 10–20 секунд нажмите «Проверить связь».");
      } else if (action === "vps_restart") {
        setNotice("Браузер перезапущен");
      } else if (action === "vps_clear") {
        setNotice("Куки очищены");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    run("vps_ping");
  }, []);

  const copy = async () => {
    if (!st?.command) return;
    await navigator.clipboard.writeText(st.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const online = st?.registered && st.last_status === "ok";
  const outdated = st?.version && st.latest_version && st.version !== st.latest_version;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Свой сервер с настоящим браузером. Через него ищутся цены WB и Ozon — простой запрос их защита не пропускает.
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {!st && <p className="text-sm text-muted-foreground">Проверяю связь...</p>}

      {st && (
        <div className="rounded-xl border border-white/[0.08] bg-background/40 p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                online
                  ? "bg-emerald-500/15 text-emerald-300"
                  : st.registered
                    ? "bg-red-500/15 text-red-300"
                    : "bg-white/10 text-muted-foreground"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : st.registered ? "bg-red-400" : "bg-white/40"}`}
              />
              {online ? "На связи" : st.registered ? "Не на связи" : "Не установлен"}
            </span>
            {st.host && (
              <span className="text-xs text-muted-foreground">
                {st.host}:{st.port}
              </span>
            )}
            {outdated && (
              <span className="text-xs text-amber-300">есть новая версия {st.latest_version}</span>
            )}
          </div>

          {st.registered && !online && st.last_message && (
            <p className="text-xs text-red-300">{st.last_message}</p>
          )}

          {st.registered && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Версия" value={st.version || "—"} />
              <Stat label="Выполнено поисков" value={st.info.done ?? "—"} />
              <Stat label="Ошибок" value={st.info.failed ?? "—"} />
              <Stat label="Без перезапуска" value={uptime(st.info.uptime)} />
            </div>
          )}
          {st.registered && (
            <p className="text-[11px] text-muted-foreground">
              Последний раз на связи: {when(st.last_ok_at)}
              {st.info.running ? ` · сейчас ищет: ${st.info.running}` : ""}
              {st.info.waiting ? ` · в очереди: ${st.info.waiting}` : ""}
            </p>
          )}

          {st.registered && (
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <Button
                  key={a.action}
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={!!busy}
                  onClick={() => (!a.confirm || window.confirm(a.confirm)) && run(a.action)}
                >
                  <Icon
                    name={busy === a.action ? "Loader2" : a.icon}
                    size={14}
                    className={`mr-1 ${busy === a.action ? "animate-spin" : ""}`}
                  />
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {st && (
        <div className="rounded-xl border border-white/[0.08] bg-background/40 p-3 space-y-2">
          <div className="text-sm font-medium">Команда установки</div>
          <p className="text-xs text-muted-foreground">
            Нужна только для нового или переустановленного сервера (Ubuntu 24.04, 2 ядра, 4 ГБ). Вставьте её в консоль
            сервера от root. Команда одноразовая и действует сутки.
          </p>
          {st.command ? (
            <>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background/80 p-2 text-[11px]">
                {st.command}
              </pre>
              <Button size="sm" className="h-8" onClick={copy}>
                <Icon name={copied ? "Check" : "Copy"} size={14} className="mr-1" />
                {copied ? "Скопировано" : "Скопировать"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => run("vps_new_code")}>
              <Icon name={busy === "vps_new_code" ? "Loader2" : "Terminal"} size={14} className="mr-1" />
              Получить команду установки
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default VpsSection;