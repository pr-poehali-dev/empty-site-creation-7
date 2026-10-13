import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import MoveHistory from "./MoveHistory";
import { OUTCOME_WAREHOUSE, fmtDuration, isMoved, wipeText, type DailyItem } from "./dailyApi";

interface Props {
  item: DailyItem;
  canRemove: boolean;
  busy: boolean;
  onRemove: (item: DailyItem) => void;
  /** Приёмка протирки: показываем её итог, рамку расхождения со складом не рисуем. */
  wipe?: boolean;
}

/** Строка проверенной позиции. Убрать её может только тот, кому дано право.
 *
 * Оранжевая рамка — товар увели с того склада, куда его отправил мастер.
 * Решение мастера при этом остаётся: счётчики считают его работу, а не склад. */
const ItemRow = ({ item, canRemove, busy, onRemove, wipe = false }: Props) => {
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const moved = !wipe && !item.wipe_result && isMoved(item);
  const planned = OUTCOME_WAREHOUSE[item.check_result || ""];

  return (
    <div
      className={`rounded-lg px-2.5 py-1 flex items-center gap-2 ${
        moved
          ? "border-2 border-amber-500 bg-amber-950/25"
          : "border border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="flex-1 min-w-0">
        <button
          className="w-full text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="text-[13px] leading-4 min-h-8 line-clamp-2 break-words">{item.tech_name}</div>
          <div className="text-xs text-muted-foreground">
            {item.supplier_barcode}
            {item.warehouse ? ` · ${item.warehouse}` : ""}
            {item.invoice_weight ? ` · ${Number(item.invoice_weight)} кг` : ""}
            {" · "}
            <span className="tabular-nums" title="От взятия в работу до итога">
              <Icon name="Timer" size={11} className="inline -mt-0.5 mr-0.5" />
              {fmtDuration(item.work_sec) || "—"}
            </span>
          </div>
          {moved && (
            <div className="text-[11px] text-amber-300/90 mt-0.5">
              Мастер: {planned} → сейчас: {item.warehouse}
            </div>
          )}
          {item.wipe_result && (
            <div
              className={`text-[11px] mt-0.5 ${item.wipe_result === "scrap" ? "text-rose-300" : "text-emerald-300"}`}
            >
              {wipe ? "" : `Протирка (${item.wipe_by_name || "—"}): `}
              {wipeText(item)}
            </div>
          )}
          {(item.fixed_at || item.wipe_fixed_at) && (
            <div className="text-[11px] text-yellow-300 mt-0.5">
              <Icon name="PencilLine" size={11} className="inline -mt-0.5 mr-0.5" />
              Исправлено
              {item.fixed_by_name && item.fixed_at ? ` (${item.fixed_by_name})` : ""}
            </div>
          )}
          {item.master_fixed_from && (
            <div className="text-[11px] text-sky-300 mt-0.5">
              Исправлено протиркой: было {OUTCOME_WAREHOUSE[item.master_fixed_from] || item.master_fixed_from}
            </div>
          )}
        </button>

        {open && <MoveHistory item={item} />}

        {confirm && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] p-2">
            <p className="text-xs text-amber-200">
              {wipe
                ? "Отменить итог протирки? Товар снова будет на складе «Протирка»."
                : "Убрать из приёмки? Товар вернётся в общий пул, его можно будет принять заново."}
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => onRemove(item)}
              >
                {busy ? "Убираем..." : "Убрать"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setConfirm(false)}
              >
                Отмена
              </Button>
            </div>
          </div>
        )}
      </div>

      {canRemove && !confirm && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-rose-300"
          title={wipe ? "Отменить итог протирки" : "Убрать из приёмки"}
          onClick={() => setConfirm(true)}
        >
          <Icon name="Trash2" size={15} />
        </Button>
      )}
    </div>
  );
};

export default ItemRow;