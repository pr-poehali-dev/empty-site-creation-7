import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const ADMIN_URL = "https://functions.poehali.dev/a368ec40-2cc1-47a2-9734-d5ae8821e6d0";

interface CleanupResult {
  scanned: number;
  used: number;
  orphans: number;
  deleted: number;
  dry_run: boolean;
}

const OwnerAuctionSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin");
    }
  }, []);

  const runCleanup = async (dryRun: boolean) => {
    setRunning(true);
    try {
      const res = await fetch(ADMIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "cleanup_orphan_photos", dry_run: dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Ошибка очистки", variant: "destructive" });
        return;
      }
      setResult(data);
      toast({
        title: dryRun
          ? `Найдено неиспользуемых: ${data.orphans}`
          : `Удалено файлов: ${data.deleted}`,
      });
    } catch {
      toast({ title: "Ошибка соединения", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate("/admin/auctions")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg sm:text-xl font-semibold">Настройки аукциона</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
              <Icon name="Image" size={20} className="text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">Очистка неиспользуемых фото</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Иногда фото загружаются в хранилище, но лот в итоге не создаётся —
                такие «осиротевшие» снимки просто занимают место. Здесь можно найти
                и удалить фотографии, на которые не ссылается ни один лот. Фото
                действующих лотов не затрагиваются.
              </p>
            </div>
          </div>

          {result && (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Всего фото в хранилище</span>
                <span className="font-medium">{result.scanned}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Используется лотами</span>
                <span className="font-medium">{result.used}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Неиспользуемых</span>
                <span className="font-medium text-amber-300">{result.orphans}</span>
              </div>
              {!result.dry_run && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Удалено</span>
                  <span className="font-medium text-emerald-400">{result.deleted}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              disabled={running}
              onClick={() => runCleanup(true)}
              className="gap-2"
            >
              {running && <Icon name="Loader2" size={16} className="animate-spin" />}
              <Icon name="Search" size={16} />
              Сначала проверить
            </Button>
            <Button
              disabled={running}
              onClick={() => runCleanup(false)}
              className="gap-2"
            >
              {running && <Icon name="Loader2" size={16} className="animate-spin" />}
              <Icon name="Trash2" size={16} />
              Найти и удалить
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default OwnerAuctionSettings;
