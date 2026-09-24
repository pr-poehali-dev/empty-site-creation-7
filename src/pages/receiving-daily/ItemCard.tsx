import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import type { DailyItem } from "./dailyApi";

interface Props {
  item: DailyItem;
  onClose: () => void;
}

/** Карточка найденной единицы. Выбор исхода — шаг 6, здесь пока заглушка. */
const ItemCard = ({ item, onClose }: Props) => (
  <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.07] p-4 space-y-3">
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1">Заявленный дефект</div>
        <div className="text-lg font-semibold leading-snug">
          {item.declared_defect?.trim() || "не указан"}
        </div>
      </div>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onClose}>
        <Icon name="X" size={16} />
      </Button>
    </div>

    <div className="text-sm break-words">{item.tech_name}</div>

    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <div>Штрихкод: {item.supplier_barcode}</div>
      {item.order_number && <div>Заказ-наряд: {item.order_number}</div>}
      {item.brand && <div>Бренд: {item.brand}</div>}
      {item.model && <div>Модель: {item.model}</div>}
    </div>

    {item.check_result && (
      <div className="rounded-lg bg-amber-500/15 p-2 text-xs text-amber-300">
        Эта единица уже проверена{item.checked_by_name ? `: ${item.checked_by_name}` : ""}
      </div>
    )}

    <div className="rounded-lg border border-dashed border-white/[0.12] p-3 text-center">
      <Icon name="Hammer" size={18} className="mx-auto mb-1 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">
        Проверка и выбор исхода — следующий шаг
      </p>
    </div>
  </div>
);

export default ItemCard;
