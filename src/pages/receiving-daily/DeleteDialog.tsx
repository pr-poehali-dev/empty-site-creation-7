import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { KIND_SHORT, receivingDate } from "./dailyApi";

interface Props {
  id: number;
  workDate: string;
  kind: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Удаляем только пустую закрытую приёмку — терять нечего, пугать незачем. */
const DeleteDialog = ({ id, workDate, kind, busy, onConfirm, onCancel }: Props) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
    <div className="w-full sm:max-w-sm bg-card border-t sm:border border-white/[0.1] sm:rounded-2xl rounded-t-2xl p-5">
      <div className="w-11 h-11 rounded-xl bg-rose-500/15 flex items-center justify-center mb-3">
        <Icon name="Trash2" size={21} className="text-rose-400" />
      </div>

      <p className="font-semibold mb-2">Удалить приёмку №{id} от {receivingDate(workDate)}?</p>

      <p className="text-sm text-muted-foreground mb-1">
        {KIND_SHORT[kind] || kind}
      </p>
      <p className="text-sm text-muted-foreground mb-5">
        Товаров в ней нет — удалится только запись о приёмке. Вернуть её будет нельзя.
      </p>

      <div className="space-y-2">
        <Button
          className="w-full bg-rose-600 hover:bg-rose-600/90 text-white"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Удаляю..." : "Удалить"}
        </Button>
        <Button variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  </div>
);

export default DeleteDialog;
