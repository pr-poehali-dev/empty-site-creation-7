import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deskCalc, deskSavePercent, deskSaveRate, type DeskItem, type DeskSet } from "@/lib/priceDesk";
import { exportPricesExcel } from "./pricesExcel";

interface Props {
  set: DeskSet;
  items: DeskItem[];
  onApply: (d: { set: DeskSet; items: DeskItem[] }) => void;
  onSetChange: (patch: Partial<DeskSet>) => void;
  onError: (msg: string) => void;
}

const str = (v: number | string | null) => (v == null ? "" : String(Number(v)));

const Field = ({
  label,
  suffix,
  value,
  onCommit,
}: {
  label: string;
  suffix: string;
  value: number | string | null;
  onCommit: (v: string) => Promise<void>;
}) => {
  const [text, setText] = useState(str(value));
  useEffect(() => setText(str(value)), [value]);
  const commit = async () => {
    if (text.trim() === str(value)) return;
    try {
      await onCommit(text.trim());
    } catch {
      setText(str(value));
    }
  };
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-8 w-20 rounded-md border border-white/15 bg-background px-2 text-sm text-foreground tabular-nums"
      />
      {suffix}
    </label>
  );
};

const CalcPanel = ({ set, items, onApply, onSetChange, onError }: Props) => {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const rate = set.rate_by_per_100_rub;
  const pct = set.percent_of_base;
  const missing = [!rate ? "курс" : "", pct == null ? "процент" : ""].filter(Boolean);
  const manualCount = items.filter((i) => i.price_by_manual || i.price_ru_manual).length;

  const saveRate = async (v: string) => {
    try {
      const d = await deskSaveRate(set.id, v);
      onSetChange({ rate_by_per_100_rub: d.rate });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ошибка");
      throw e;
    }
  };

  const savePct = async (v: string) => {
    try {
      const d = await deskSavePercent(set.id, v);
      onSetChange({ percent_of_base: d.percent });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ошибка");
      throw e;
    }
  };

  const calc = async (includeManual: boolean) => {
    setAsk(false);
    setBusy(true);
    try {
      onApply(await deskCalc(set.id, includeManual));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Field label="За 100 RUB —" suffix="BYN" value={rate} onCommit={saveRate} />
      <Field label="Процент от Базовой" suffix="%" value={pct} onCommit={savePct} />
      <Button
        size="sm"
        className="h-8"
        disabled={busy || missing.length > 0}
        title={missing.length ? `Введите ${missing.join(" и ")}` : "Пересчитать Цену РБ и Цену РФ по всем товарам"}
        onClick={() => (manualCount ? setAsk(true) : calc(false))}
      >
        <Icon name={busy ? "Loader2" : "Calculator"} size={14} className={`mr-1.5 ${busy ? "animate-spin" : ""}`} />
        Рассчитать цены
      </Button>
      {missing.length > 0 && <span className="text-xs text-amber-300">Введите {missing.join(" и ")}</span>}
      <Button variant="outline" size="sm" className="h-8" onClick={() => exportPricesExcel(set, items)}>
        <Icon name="FileSpreadsheet" size={14} className="mr-1.5" />
        Скачать Excel
      </Button>

      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Пересчитать и ручные?</AlertDialogTitle>
            <AlertDialogDescription>
              У {manualCount} товаров цены исправлены вручную. Пересчитать их тоже по формуле или оставить как есть?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <Button variant="outline" onClick={() => calc(true)}>
              Да, и ручные
            </Button>
            <AlertDialogAction onClick={() => calc(false)}>Только автоматические</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CalcPanel;
