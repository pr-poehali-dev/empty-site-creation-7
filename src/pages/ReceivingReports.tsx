import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { useReceivingPerms } from "@/hooks/useReceivingPerms";

const REPORTS_URL = "https://functions.poehali.dev/233695d1-59d6-48a4-9203-271a80cd499b";

const auth = () => ({
  "X-Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Первый день приёмки: раньше него отчёт не строится. Такая же дата на сервере. */
const FIRST_DAY = "2026-09-21";
const notBefore = (d: string, min: string) => (d && d < min ? min : d);

const ReceivingReports = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";
  const { loading, can } = useReceivingPerms();
  const access = isOwner || can("report_summary");

  const now = new Date();
  const [from, setFromRaw] = useState(
    notBefore(iso(new Date(now.getFullYear(), now.getMonth(), 1)), FIRST_DAY)
  );
  const [to, setToRaw] = useState(notBefore(iso(now), FIRST_DAY));

  // Раньше первого дня — ставим первый день; «с» позже «по» — двигаем «по» следом.
  const setFrom = (v: string) => {
    const f = notBefore(v, FIRST_DAY);
    setFromRaw(f);
    if (f && to && to < f) setToRaw(f);
  };
  const setTo = (v: string) => setToRaw(notBefore(v, from || FIRST_DAY));
  const [master, setMaster] = useState("");
  const [masters, setMasters] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "xlsx" | "pdf">("");

  useEffect(() => {
    if (!access) return;
    fetch(`${REPORTS_URL}?action=masters`, { headers: auth() })
      .then((r) => r.json())
      .then((d) => setMasters(d.masters || []))
      .catch(() => setMasters([]));
  }, [access]);

  const download = async (format: "xlsx" | "pdf") => {
    if (from && to && from > to) {
      toast({ title: "Начало периода позже конца", variant: "destructive" });
      return;
    }
    setBusy(format);
    try {
      const p = new URLSearchParams({
        action: "summary",
        format,
        from,
        to,
        master,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow",
        offset: String(-new Date().getTimezoneOffset()),
      });
      const r = await fetch(`${REPORTS_URL}?${p}`, { headers: auth() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось собрать отчёт");
      const bytes = Uint8Array.from(atob(d.file), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type:
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const header = (
    <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
      <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => navigate("/admin/receipts")}
        >
          <Icon name="ArrowLeft" size={18} />
        </Button>
        <h1 className="flex-1 text-lg font-semibold">Отчёты</h1>
      </div>
    </header>
  );

  if (loading && !isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!access) {
    return (
      <div className="min-h-screen flex flex-col">
        {header}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
            <Icon name="Lock" size={30} className="mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Отчёты вам не открыты</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {header}
      <main className="max-w-2xl mx-auto w-full px-4 py-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <Icon name="FileBarChart" size={20} className="text-violet-300" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">Сводка за период + содержание складов</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Сколько проверено и куда отправлено за период — по мастеру или по всем.
                Склады — на сейчас, без учёта периода.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">С</span>
              <Input
                type="date"
                value={from}
                min={FIRST_DAY}
                onChange={(e) => setFrom(e.target.value)}
                className="h-10"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">По</span>
              <Input
                type="date"
                value={to}
                min={from || FIRST_DAY}
                onChange={(e) => setTo(e.target.value)}
                className="h-10"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Мастер</span>
            <select
              value={master}
              onChange={(e) => setMaster(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Все мастера</option>
              {masters.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button className="h-11" disabled={!!busy} onClick={() => download("xlsx")}>
              <Icon
                name={busy === "xlsx" ? "Loader2" : "FileSpreadsheet"}
                size={16}
                className={`mr-1.5 ${busy === "xlsx" ? "animate-spin" : ""}`}
              />
              Excel
            </Button>
            <Button
              variant="outline"
              className="h-11 border-white/[0.15]"
              disabled={!!busy}
              onClick={() => download("pdf")}
            >
              <Icon
                name={busy === "pdf" ? "Loader2" : "FileText"}
                size={16}
                className={`mr-1.5 ${busy === "pdf" ? "animate-spin" : ""}`}
              />
              PDF
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ReceivingReports;
