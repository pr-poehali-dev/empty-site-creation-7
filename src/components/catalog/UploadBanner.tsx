import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

export interface UploadProgress {
  draftId: number;
  status: "running" | "done" | "error";
  done: number;
  total: number;
  created: number;
  updated: number;
  barcodes: number;
  error: string;
}

interface Props {
  p: UploadProgress;
  canRetry: boolean;
  onRetry: () => void;
  onClose: () => void;
}

const UploadBanner = ({ p, canRetry, onRetry, onClose }: Props) => {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const counts = `Создано ${p.created}, обновлено ${p.updated}, штрихкодов ${p.barcodes}`;

  const tone =
    p.status === "error"
      ? "border-red-500/40 bg-red-950"
      : p.status === "done"
        ? "border-emerald-500/40 bg-emerald-950"
        : "border-white/[0.08] bg-card";

  return (
    <>
      {p.status === "running" && <div className="fixed inset-0 z-40 bg-black/40" />}
      <div className="fixed top-0 inset-x-0 z-50 p-3">
        <div className={`max-w-3xl mx-auto rounded-2xl border shadow-lg p-3 space-y-2 ${tone}`}>
          <div className="flex items-start gap-2">
            <Icon
              name={p.status === "running" ? "Loader" : p.status === "done" ? "CircleCheck" : "CircleAlert"}
              size={18}
              className={`shrink-0 mt-0.5 ${p.status === "running" ? "animate-spin text-primary" : p.status === "done" ? "text-emerald-400" : "text-red-400"}`}
            />
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-medium">
                {p.status === "running" && `Загружаю в каталог: ${p.done} из ${p.total}`}
                {p.status === "done" && "Готово, каталог загружен"}
                {p.status === "error" && `Загрузка остановилась на ${p.done} из ${p.total}`}
              </div>
              <div className="text-xs text-muted-foreground">{counts}</div>
              {p.status === "error" && <div className="text-xs text-red-300 mt-1 break-words">{p.error}</div>}
              {p.status === "running" && (
                <div className="text-xs text-muted-foreground mt-1">Не закрывайте страницу до окончания</div>
              )}
            </div>
            {p.status !== "running" && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <Icon name="X" size={16} />
              </button>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all ${p.status === "error" ? "bg-red-500" : p.status === "done" ? "bg-emerald-500" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {p.status === "error" && canRetry && (
            <Button size="sm" className="rounded-xl w-full" onClick={onRetry}>
              Продолжить загрузку
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default UploadBanner;
