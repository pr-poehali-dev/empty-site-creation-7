import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const SCHEDULER_URL = "https://functions.poehali.dev/0a8bb7a5-8f5d-444b-a83c-0970298d4d53";

interface Job {
  id: number;
  func_name: string;
  interval_minutes: number;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  title: string;
  description: string;
}

interface Allowed {
  func_name: string;
  title: string;
  description: string;
}

const OwnerScheduler = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [allowed, setAllowed] = useState<Allowed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newFunc, setNewFunc] = useState("");
  const [newInterval, setNewInterval] = useState("1");

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin");
      return;
    }
    load();
  }, []);

  const load = async () => {
    try {
      const res = await fetch(SCHEDULER_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setJobs(data.jobs || []);
        setAllowed(data.allowed || []);
      } else {
        toast({ title: data.error || "Ошибка загрузки", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка соединения", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const post = async (payload: object) => {
    setBusy(true);
    try {
      const res = await fetch(SCHEDULER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Ошибка", variant: "destructive" });
        return null;
      }
      return data;
    } catch {
      toast({ title: "Ошибка соединения", variant: "destructive" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addJob = async () => {
    if (!newFunc) {
      toast({ title: "Выберите функцию", variant: "destructive" });
      return;
    }
    const iv = Math.max(1, parseInt(newInterval) || 1);
    const ok = await post({ op: "add", func_name: newFunc, interval_minutes: iv });
    if (ok) {
      toast({ title: "Задание добавлено" });
      setNewFunc("");
      setNewInterval("1");
      load();
    }
  };

  const toggle = async (job: Job, enabled: boolean) => {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, enabled } : j)));
    await post({ op: "update", id: job.id, enabled });
  };

  const changeInterval = async (job: Job, value: string) => {
    const iv = Math.max(1, parseInt(value) || 1);
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, interval_minutes: iv } : j)));
    await post({ op: "update", id: job.id, interval_minutes: iv });
  };

  const removeJob = async (job: Job) => {
    const ok = await post({ op: "delete", id: job.id });
    if (ok) {
      toast({ title: "Задание удалено" });
      load();
    }
  };

  const pushNow = async (job: Job) => {
    const res = await post({ op: "push_now", id: job.id });
    if (res) {
      toast({
        title: res.success ? "Функция вызвана" : "Функция ответила ошибкой",
        description: res.info,
        variant: res.success ? undefined : "destructive",
      });
      load();
    }
  };

  const fmtTime = (iso: string | null) => {
    if (!iso) return "ещё не запускалась";
    const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // функции, которых ещё нет в расписании
  const availableToAdd = allowed.filter(
    (a) => !jobs.some((j) => j.func_name === a.func_name)
  );

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
          <h1 className="text-lg sm:text-xl font-semibold">Толкатель</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
              <Icon name="AlarmClock" size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Единый будильник сайта. Раз в минуту он просыпается и запускает функции из списка
              ниже — каждую со своим интервалом. Так не нужно настраивать расписание для каждой
              функции отдельно.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Загрузка…</p>
        ) : (
          <>
            {jobs.length === 0 ? (
              <div className="rounded-xl border border-white/[0.08] bg-card p-6 text-center text-muted-foreground text-sm">
                Пока ни одной функции в расписании. Добавьте ниже.
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{job.title}</p>
                        {job.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {job.description}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={job.enabled}
                        disabled={busy}
                        onCheckedChange={(c) => toggle(job, c)}
                      />
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Каждые</span>
                      <Input
                        type="number"
                        min={1}
                        defaultValue={job.interval_minutes}
                        disabled={busy}
                        onBlur={(e) => {
                          if (parseInt(e.target.value) !== job.interval_minutes) {
                            changeInterval(job, e.target.value);
                          }
                        }}
                        className="h-8 w-20"
                      />
                      <span className="text-muted-foreground">мин.</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Последний запуск: {fmtTime(job.last_run_at)}
                        {job.last_status === "ok" && (
                          <span className="text-emerald-400"> · успешно</span>
                        )}
                        {job.last_status === "error" && (
                          <span className="text-rose-400"> · ошибка</span>
                        )}
                      </span>
                    </div>
                    {job.last_status === "error" && job.last_error && (
                      <p className="text-xs text-rose-400/80 break-all">{job.last_error}</p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => pushNow(job)}
                        className="gap-1.5 h-8"
                      >
                        <Icon name="Play" size={14} />
                        Толкнуть сейчас
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => removeJob(job)}
                        className="gap-1.5 h-8 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        <Icon name="Trash2" size={14} />
                        Удалить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
              <p className="font-medium text-sm">Добавить функцию в расписание</p>
              {availableToAdd.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Все доступные функции уже в расписании.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={newFunc} onValueChange={setNewFunc}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Выберите функцию" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((a) => (
                        <SelectItem key={a.func_name} value={a.func_name}>
                          {a.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={newInterval}
                      onChange={(e) => setNewInterval(e.target.value)}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">мин.</span>
                  </div>
                  <Button disabled={busy} onClick={addJob} className="gap-1.5">
                    <Icon name="Plus" size={16} />
                    Добавить
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default OwnerScheduler;
