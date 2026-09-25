import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type { DailyItem } from "./dailyApi";

interface Props {
  item: DailyItem;
  onClose: () => void;
}

const RESULTS: Record<string, { text: string; cls: string }> = {
  sale: { text: "На продажу · СГП", cls: "text-emerald-300" },
  wipe: { text: "На протирку · Протирка", cls: "text-sky-300" },
  repair: { text: "Не работает · Под ремонт", cls: "text-amber-300" },
  scrap: { text: "Утиль", cls: "text-rose-300" },
};

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "";

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2 text-xs">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="break-all">{value}</span>
  </div>
);

/** Итог проверки, только чтение: в закрытую приёмку возврата для правки нет. */
const ArchiveItemCard = ({ item, onClose }: Props) => {
  const res = RESULTS[item.check_result || ""];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-card border-t sm:border border-white/[0.1] sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-white/[0.08] px-4 py-3 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground">Результат</div>
            <div className={`text-base font-semibold ${res?.cls || ""}`}>
              {res?.text || "не записан"}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose}>
            <Icon name="X" size={18} />
          </Button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="text-sm break-words">{item.tech_name}</div>

          <div className="space-y-1">
            <Row label="Штрихкод:" value={item.supplier_barcode} />
            {item.factory_barcode && (
              <Row label="Заводской:" value={item.factory_barcode} />
            )}
            {item.order_number && <Row label="Заказ-наряд:" value={item.order_number} />}
            {item.brand && <Row label="Бренд:" value={item.brand} />}
            {item.model && <Row label="Модель:" value={item.model} />}
            {item.warehouse && <Row label="Склад:" value={item.warehouse} />}
            {item.has_package != null && (
              <Row label="Упаковка:" value={item.has_package ? "есть" : "нет"} />
            )}
            {item.invoice_weight != null && (
              <Row label="Вес:" value={`${Number(item.invoice_weight)} кг`} />
            )}
          </div>

          {item.declared_defect?.trim() && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
              <div className="text-[11px] text-muted-foreground mb-0.5">
                Заявленный дефект
              </div>
              <div className="text-xs break-words">{item.declared_defect}</div>
              {item.defect_confirmed != null && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  {item.defect_confirmed ? "подтвердился" : "не подтвердился"}
                </div>
              )}
            </div>
          )}

          {item.new_defect && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5">
              <div className="text-[11px] text-amber-200/80 mb-0.5">Новый дефект</div>
              <div className="text-xs break-words">
                {item.new_defect_text?.trim() || "без описания"}
              </div>
            </div>
          )}

          <div className="text-[11px] text-muted-foreground border-t border-white/[0.06] pt-2">
            {item.checked_by_name ? `Проверил: ${item.checked_by_name}` : "Кто проверил — не записано"}
            {item.checked_at ? ` · ${dt(item.checked_at)}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchiveItemCard;
