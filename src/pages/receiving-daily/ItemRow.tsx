import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import MoveHistory from "./MoveHistory";
import { OUTCOME_WAREHOUSE, isMoved, type DailyItem } from "./dailyApi";

interface Props {
  item: DailyItem;
  canRemove: boolean;
  busy: boolean;
  onRemove: (item: DailyItem) => void;
}

/** Строка проверенной позиции. Убрать её может только тот, кому дано право.
 *
 * Оранжевая рамка — товар увели с того склада, куда его отправил мастер.
 * Решение мастера при этом остаётся: счётчики считают его работу, а не склад. */
const ItemRow = ({ item, canRemove, busy, onRemove }: Props) => {
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const moved = isMoved(item);
  const planned = OUTCOME_WAREHOUSE[item.check_result || ""];

  return (
    <div
      className={`px-4 py-2 flex items-start gap-2 ${
        moved ? "border-l-2 border-amber-500/70 bg-amber-500/[0.04]" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <button
          className="w-full text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="text-sm truncate">{item.tech_name}</div>
          <div className="text-xs text-muted-foreground">
            {item.supplier_barcode}
            {item.warehouse ? ` · ${item.warehouse}` : ""}
            {item.invoice_weight ? ` · ${Number(item.invoice_weight)} кг` : ""}
          </div>
          {moved && (
            <div className="text-[11px] text-amber-300/90 mt-0.5">
              Мастер: {planned} → сейчас: {item.warehouse}
            </div>
          )}
        </button>

        {open && <MoveHistory item={item} />}

        {confirm && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] p-2">
            <p className="text-xs text-amber-200">
              Убрать из приёмки? Товар вернётся в общий пул, его можно будет
              принять заново.
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
          title="Убрать из приёмки"
          onClick={() => setConfirm(true)}
        >
          <Icon name="Trash2" size={15} />
        </Button>
      )}
    </div>
  );
};

export default ItemRow;