import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import CheckFactoryStep from "./CheckFactoryStep";
import CheckOutcomeStep from "./CheckOutcomeStep";
import CheckPackageStep from "./CheckPackageStep";
import {
  saveCheck,
  saveFactoryCode,
  type Counters,
  type DailyItem,
  type Outcome,
} from "./dailyApi";

interface Props {
  item: DailyItem;
  receivingId: number;
  onDone: (counters: Counters, item: DailyItem) => void;
  onClose: () => void;
}

type Stage = "package" | "factory" | "outcome";

/** Порядок жёсткий: упаковка → заводской код (если его ещё нет) → исход. */
const CheckDialog = ({ item, receivingId, onDone, onClose }: Props) => {
  const needFactory = !item.factory_barcode?.trim();
  const [stage, setStage] = useState<Stage>("package");
  const [hasPackage, setHasPackage] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const pickPackage = (value: boolean) => {
    setHasPackage(value);
    setStage(needFactory ? "factory" : "outcome");
  };

  const pickFactory = async (code: string) => {
    setBusy(true);
    try {
      const r = await saveFactoryCode(item.id, code);
      if (r.updated > 1) {
        toast({ title: `Код записан всей модели: ${r.updated} шт.` });
      }
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
      setStage("outcome");
    }
  };

  const pickOutcome = async (
    outcome: Outcome,
    defects?: { defect_confirmed: boolean; new_defect: boolean; new_defect_text: string }
  ) => {
    setBusy(true);
    try {
      const r = await saveCheck({
        item_id: item.id,
        receiving_id: receivingId,
        outcome,
        has_package: hasPackage ?? undefined,
        ...defects,
      });
      onDone(r.counters, { ...item, check_result: outcome });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-card border-t sm:border border-white/[0.1] sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-white/[0.08] px-4 py-3 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground">
              Заявленный дефект
            </div>
            <div className="text-base font-semibold leading-snug break-words">
              {item.declared_defect?.trim() || "не указан"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={onClose}
          >
            <Icon name="X" size={18} />
          </Button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="text-sm break-words">{item.tech_name}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <div className="break-all">Штрихкод: {item.supplier_barcode}</div>
            {item.order_number && <div>Заказ-наряд: {item.order_number}</div>}
            {item.brand && <div>Бренд: {item.brand}</div>}
            {item.model && <div className="break-all">Модель: {item.model}</div>}
          </div>

          {item.check_result && (
            <div className="rounded-lg bg-amber-500/15 border border-amber-500/30 p-2.5 text-xs text-amber-200">
              <Icon name="TriangleAlert" size={14} className="inline mr-1 -mt-0.5" />
              Уже проверена
              {item.checked_by_name ? `: ${item.checked_by_name}` : ""}. Новый
              выбор перезапишет прежний результат.
            </div>
          )}

          <div className="pt-1">
            {stage === "package" && (
              <CheckPackageStep item={item} onPick={pickPackage} />
            )}
            {stage === "factory" && (
              <CheckFactoryStep
                item={item}
                onDone={pickFactory}
                onSkip={() => setStage("outcome")}
              />
            )}
            {stage === "outcome" && (
              <CheckOutcomeStep busy={busy} onPick={pickOutcome} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckDialog;