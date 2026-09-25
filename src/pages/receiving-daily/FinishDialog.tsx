import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface Props {
  total: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Закрытие необратимо, а кнопка рядом со сканером — один промах пальцем стоит приёмки. */
const FinishDialog = ({ total, busy, onConfirm, onCancel }: Props) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
    <div className="w-full sm:max-w-sm bg-card border-t sm:border border-white/[0.1] sm:rounded-2xl rounded-t-2xl p-5">
      <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center mb-3">
        <Icon name="TriangleAlert" size={22} className="text-amber-400" />
      </div>

      <p className="font-semibold mb-2">Закончить приёмку?</p>

      <p className="text-sm text-muted-foreground mb-2">
        Проверено единиц: {total}.
      </p>
      <p className="text-sm text-muted-foreground mb-5">
        После закрытия приёмка уйдёт в архив — дописать в неё товар будет нельзя.
        Зайти и посмотреть, что делали, можно всегда. Если остался непроверенный
        товар, придётся открывать новую приёмку.
      </p>

      <div className="space-y-2">
        <Button className="w-full" disabled={busy} onClick={onConfirm}>
          {busy ? "Закрываю..." : "Закончить"}
        </Button>
        <Button variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  </div>
);

export default FinishDialog;
