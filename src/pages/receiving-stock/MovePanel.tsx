import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { findByCode, moveItems, undoMove } from "./stockApi";

interface Props {
  warehouses: { key: string; name: string }[];
  selected: Set<number>;
  onDone: () => void;
  onClear: () => void;
}

const REASONS: Record<string, string> = {
  not_checked: "Единица ещё не проверена — сначала приёмка",
  no_access: "Товар лежит на складе, который вам не открыт",
};

/** Перемещение без документов: выбрал куда, перенёс. Сканером или галочками. */
const MovePanel = ({ warehouses, selected, onDone, onClear }: Props) => {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastMove, setLastMove] = useState<{ ids: number[]; text: string } | null>(null);

  const scanMove = async (code: string) => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const f = await findByCode(code);
      if (!f.found || !f.item) {
        toast({
          title: REASONS[f.reason || ""] || "Не нашли такую единицу",
          variant: "destructive",
        });
        return;
      }
      if (f.item.warehouse === target) {
        toast({ title: `Уже на складе ${target}` });
        return;
      }
      const r = await moveItems([f.item.id], target);
      setLastMove({
        ids: r.move_ids,
        text: `${f.item.tech_name} → ${target}`,
      });
      onDone();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  useBarcodeScanner({ enabled: !!target, onScan: scanMove });

  const moveSelected = async () => {
    if (!target || selected.size === 0) return;
    setBusy(true);
    try {
      const r = await moveItems([...selected], target);
      setLastMove({ ids: r.move_ids, text: `${r.moved} шт. → ${target}` });
      toast({
        title: `Перенесли: ${r.moved}`,
        description: r.skipped ? `Пропустили: ${r.skipped}` : undefined,
      });
      onClear();
      onDone();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!lastMove) return;
    setBusy(true);
    try {
      const r = await undoMove(lastMove.ids);
      setLastMove(null);
      toast({
        title: `Вернули обратно: ${r.restored}`,
        description: r.kept
          ? `${r.kept} шт. уже двинули дальше — их не трогали`
          : undefined,
      });
      onDone();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="ArrowRightLeft" size={16} className="text-sky-400" />
        <span className="text-sm font-medium">Переместить на склад</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {warehouses.map((w) => (
          <button
            key={w.key}
            onClick={() => setTarget(target === w.name ? "" : w.name)}
            className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              target === w.name
                ? "border-sky-500/50 bg-sky-500/20 text-sky-200"
                : "border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            {w.name}
          </button>
        ))}
      </div>

      {target && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-2.5 flex items-center gap-2">
          <Icon name="ScanLine" size={16} className="text-emerald-400 shrink-0" />
          <span className="text-xs text-emerald-200">
            Пикайте товар — каждый выстрел переносит на «{target}»
          </span>
        </div>
      )}

      {selected.size > 0 && (
        <Button
          className="w-full h-11"
          disabled={!target || busy}
          onClick={moveSelected}
        >
          {busy ? (
            <Icon name="Loader2" size={16} className="animate-spin" />
          ) : (
            `Перенести отмеченные: ${selected.size}`
          )}
        </Button>
      )}

      {lastMove && (
        <div className="rounded-lg bg-white/[0.04] p-2.5 flex items-center gap-2">
          <Icon name="CircleCheck" size={15} className="text-emerald-400 shrink-0" />
          <span className="text-xs flex-1 min-w-0 truncate">{lastMove.text}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs"
            disabled={busy}
            onClick={undo}
          >
            <Icon name="Undo2" size={13} className="mr-1" />
            Отменить
          </Button>
        </div>
      )}
    </div>
  );
};

export default MovePanel;