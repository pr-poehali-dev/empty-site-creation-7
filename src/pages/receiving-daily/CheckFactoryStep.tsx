import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import type { DailyItem } from "./dailyApi";

interface Props {
  item: DailyItem;
  onDone: (code: string) => void;
  onSkip: () => void;
}

/**
 * Заводской код спрашиваем один раз на модель. Наклейка бывает мятая и стёртая —
 * поэтому рядом со сканером всегда есть поле для ручного ввода.
 */
const CheckFactoryStep = ({ item, onDone, onSkip }: Props) => {
  const [value, setValue] = useState("");

  useBarcodeScanner({ enabled: true, onScan: (code) => onDone(code) });

  const submit = () => {
    const code = value.trim();
    if (code) onDone(code);
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center mx-auto mb-2">
          <Icon name="ScanBarcode" size={22} className="text-violet-400" />
        </div>
        <p className="text-lg font-semibold leading-snug">
          Отсканируйте заводской штрихкод
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Тот, что на самом товаре — он проставится всем единицам этой модели
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Или введите вручную"
          className="h-11"
        />
        <Button className="h-11 px-4" disabled={!value.trim()} onClick={submit}>
          <Icon name="Check" size={18} />
        </Button>
      </div>

      <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground break-words">
        {item.tech_name}
      </div>

      <Button variant="ghost" className="w-full h-10" onClick={onSkip}>
        Наклейки нет — пропустить
      </Button>
    </div>
  );
};

export default CheckFactoryStep;
