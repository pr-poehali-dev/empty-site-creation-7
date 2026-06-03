import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import {
  backupApi, formatSize, typeLabel, BackupSettings, BackupItem,
} from "./owner-backup/backupApi";

const OwnerBackup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");

  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [common, setCommon] = useState<BackupItem[]>([]);
  const [protectedList, setProtectedList] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [protectManual, setProtectManual] = useState(false);
  const [note, setNote] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin/dashboard");
      return;
    }
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [s, l] = await Promise.all([backupApi.getSettings(), backupApi.list()]);
      setSettings(s.settings);
      setCommon(l.common);
      setProtectedList(l.protected);
    } catch {
      toast({ title: "Не удалось загрузить данные архивации", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const refreshList = async () => {
    const l = await backupApi.list();
    setCommon(l.common);
    setProtectedList(l.protected);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const r = await backupApi.saveSettings(settings);
      setSettings(r.settings);
      toast({ title: "Настройки сохранены" });
    } catch (e) {
      toast({ title: "Не удалось сохранить", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createBackup = async () => {
    setCreating(true);
    try {
      const r = await backupApi.create(protectManual, note || undefined);
      if (r.success) {
        toast({
          title: "Копия создана",
          description: `Размер ${formatSize(r.backup.size_bytes)}, таблиц ${r.backup.tables_count}, за ${r.backup.duration_sec} сек`,
        });
        setNote("");
        await refreshList();
      } else {
        toast({
          title: "Ошибка создания копии",
          description: `${r.error}. Если это таймаут — увеличь таймаут функции и попробуй снова.`,
          variant: "destructive",
        });
        await refreshList();
      }
    } catch (e) {
      toast({ title: "Ошибка", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const doRestore = async () => {
    if (!restoreTarget) return;
    const id = restoreTarget.id;
    setRestoreTarget(null);
    setBusyId(id);
    try {
      const r = await backupApi.restore(id);
      toast({
        title: "Данные восстановлены",
        description: `Таблиц ${r.restored_tables}, строк ${r.restored_rows}. Создана страховочная копия #${r.safety_backup_id}.`,
      });
      await refreshList();
    } catch (e) {
      toast({ title: "Восстановление не выполнено", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setBusyId(id);
    try {
      await backupApi.remove(id);
      toast({ title: "Копия удалена" });
      await refreshList();
    } catch (e) {
      toast({ title: "Не удалось удалить", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

  const renderRow = (b: BackupItem) => (
    <div key={b.id} className="flex items-center justify-between gap-3 py-3 border-b border-white/[0.06] last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{fmtDate(b.created_at)}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06]">{typeLabel(b.type)}</span>
          {b.status === "failed" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Ошибка</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {b.status === "failed"
            ? b.error_message
            : `${formatSize(b.size_bytes)} · таблиц ${b.tables_count} · строк ${b.rows_count}`}
          {b.note ? ` · ${b.note}` : ""}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {b.status === "success" && (
          <Button size="sm" variant="outline" disabled={busyId === b.id}
            onClick={() => setRestoreTarget(b)}>
            <Icon name="RotateCcw" size={16} />
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busyId === b.id}
          onClick={() => setDeleteTarget(b)}>
          <Icon name="Trash2" size={16} />
        </Button>
      </div>
    </div>
  );

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={32} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/dashboard")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Архивация данных</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Автоматический бэкап</h2>
              <p className="text-xs text-muted-foreground">Копии создаются по расписанию (время МСК)</p>
            </div>
            <Switch checked={settings.auto_enabled}
              onCheckedChange={(v) => setSettings({ ...settings, auto_enabled: v })} />
          </div>

          <RadioGroup value={settings.mode}
            onValueChange={(v) => setSettings({ ...settings, mode: v as "daily" | "interval" })}
            className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="daily" id="m-daily" />
                <Label htmlFor="m-daily">Раз в N дней в указанное время</Label>
              </div>
              {settings.mode === "daily" && (
                <div className="flex items-center gap-2 pl-6 flex-wrap">
                  <span className="text-sm">каждые</span>
                  <Input type="number" min={1} className="w-20"
                    value={settings.daily_every_days}
                    onChange={(e) => setSettings({ ...settings, daily_every_days: +e.target.value })} />
                  <span className="text-sm">дн., в</span>
                  <Input type="time" className="w-28"
                    value={settings.daily_time}
                    onChange={(e) => setSettings({ ...settings, daily_time: e.target.value })} />
                  <span className="text-sm text-muted-foreground">МСК</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="interval" id="m-interval" />
                <Label htmlFor="m-interval">Через интервал</Label>
              </div>
              {settings.mode === "interval" && (
                <div className="flex items-center gap-2 pl-6 flex-wrap">
                  <span className="text-sm">каждые</span>
                  <Input type="number" min={15} step={5} className="w-24"
                    value={settings.interval_minutes}
                    onChange={(e) => setSettings({ ...settings, interval_minutes: +e.target.value })} />
                  <span className="text-sm font-medium">минут</span>
                  <span className="text-xs text-muted-foreground">(минимум 15 минут)</span>
                </div>
              )}
            </div>
          </RadioGroup>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <Label className="text-xs">Хранить дней</Label>
              <Input type="number" min={1} value={settings.retention_days}
                onChange={(e) => setSettings({ ...settings, retention_days: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Хранить штук</Label>
              <Input type="number" min={1} value={settings.retention_count}
                onChange={(e) => setSettings({ ...settings, retention_count: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Таймаут функции, сек</Label>
              <Input type="number" min={5} value={settings.function_timeout_sec}
                onChange={(e) => setSettings({ ...settings, function_timeout_sec: +e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Если создание копии падает по таймауту — увеличь это значение, и в кабинете проекта
            (Ядро → Функции → data-backup → Настройки) выстави такой же таймаут.
          </p>

          <Button onClick={saveSettings} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить настройки"}
          </Button>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Ручная архивация</h2>
          <p className="text-xs text-muted-foreground">
            Создай копию перед срочными глобальными изменениями в проекте.
          </p>
          <Input placeholder="Комментарий (необязательно)" value={note}
            onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center gap-2">
            <Checkbox id="protect" checked={protectManual}
              onCheckedChange={(v) => setProtectManual(!!v)} />
            <Label htmlFor="protect" className="text-sm">
              Защитить копию (не удалять автоматически)
            </Label>
          </div>
          <Button onClick={createBackup} disabled={creating}>
            {creating ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Save" size={16} className="mr-2" />}
            Создать копию сейчас
          </Button>
        </Card>

        <Card className="p-5">
          <Tabs defaultValue="common">
            <TabsList className="mb-3">
              <TabsTrigger value="common">Общие ({common.length})</TabsTrigger>
              <TabsTrigger value="protected">Защищённые ({protectedList.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="common">
              {common.length === 0
                ? <p className="text-sm text-muted-foreground py-4">Копий пока нет</p>
                : common.map(renderRow)}
            </TabsContent>
            <TabsContent value="protected">
              {protectedList.length === 0
                ? <p className="text-sm text-muted-foreground py-4">Защищённых копий нет</p>
                : protectedList.map(renderRow)}
            </TabsContent>
          </Tabs>
        </Card>
      </main>

      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Восстановить данные из копии?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущие данные будут заменены на состояние из копии от{" "}
              {restoreTarget && fmtDate(restoreTarget.created_at)}. Перед откатом автоматически
              создастся страховочная копия текущего состояния, поэтому действие можно отменить.
              Активные сессии пользователей не затрагиваются.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={doRestore}>Восстановить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить копию?</AlertDialogTitle>
            <AlertDialogDescription>
              Копия от {deleteTarget && fmtDate(deleteTarget.created_at)} будет удалена безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OwnerBackup;
