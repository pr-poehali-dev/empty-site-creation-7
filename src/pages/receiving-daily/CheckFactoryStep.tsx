import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import CameraScanButton from "@/components/receiving/CameraScanButton";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import {
  CHECKSUM_BAD_TEXT,
  checksumState,
  findSimilar,
  type CodeSummary,
} from "@/lib/barcodeFix";
import type { DailyItem } from "./dailyApi";

interface Props {
  item: DailyItem;
  onDone: (code: string) => void;
  onSkip: () => void;
  onCameraOpen: () => void;
}

interface Warn {
  code: string;
  checksumBad: boolean;
  exists: boolean;
  similar: CodeSummary[];
}

/**
 * Заводской код спрашиваем один раз на модель. Наклейка бывает мятая и стёртая —
 * поэтому рядом со сканером всегда есть поле для ручного ввода.
 * Код с неверным контрольным числом молча не записываем — мастер подтверждает сам.
 * При вводе вручную ещё и сверяемся с базой: нет ли уже такого или очень похожего кода.
 */
const CheckFactoryStep = ({ item, onDone, onSkip, onCameraOpen }: Props) => {
  const [value, setValue] = useState("");
  const [warn, setWarn] = useState<Warn | null>(null);
  const [checking, setChecking] = useState(false);

  const liveBad = checksumState(value) === "bad";

  const fromScanner = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    if (checksumState(code) === "bad") {
      setValue(code);
      setWarn({ code, checksumBad: true, exists: false, similar: [] });
      return;
    }
    onDone(code);
  };

  useBarcodeScanner({ enabled: !checking && !warn, onScan: fromScanner });

  const submit = async () => {
    const code = value.trim();
    if (!code || checking) return;
    const checksumBad = checksumState(code) === "bad";
    let exists = false;
    let similar: CodeSummary[] = [];
    setChecking(true);
    try {
      const r = await findSimilar(code);
      exists = r.exists;
      similar = r.candidates.slice(0, 3);
    } catch {
      /* сеть подвела — сверку с базой пропускаем, контрольное число проверено и так */
    } finally {
      setChecking(false);
    }
    if (checksumBad || exists || similar.length > 0) {
      setWarn({ code, checksumBad, exists, similar });
      return;
    }
    onDone(code);
  };

  const edit = (v: string) => {
    setValue(v);
    setWarn(null);
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
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !warn && submit()}
          placeholder="Или введите вручную"
          inputMode="numeric"
          className={`h-11 ${liveBad ? "border-rose-500/70" : ""}`}
        />
        <CameraScanButton fieldKey="daily_factory" onCode={edit} onOpen={onCameraOpen} />
        <Button
          className="h-11 px-4"
          disabled={!value.trim() || checking || Boolean(warn)}
          onClick={submit}
        >
          <Icon
            name={checking ? "Loader2" : "Check"}
            size={18}
            className={checking ? "animate-spin" : ""}
          />
        </Button>
      </div>

      {liveBad && !warn && (
        <p className="text-xs text-rose-400 flex items-start gap-1.5">
          <Icon name="CircleAlert" size={14} className="shrink-0 mt-0.5" />
          {CHECKSUM_BAD_TEXT}
        </p>
      )}

      {warn && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.08] p-3 space-y-2">
          <div className="font-mono text-sm break-all">{warn.code}</div>
          {warn.checksumBad && (
            <p className="text-sm text-rose-300 flex items-start gap-1.5">
              <Icon name="CircleAlert" size={16} className="shrink-0 mt-0.5" />
              {CHECKSUM_BAD_TEXT}
            </p>
          )}
          {warn.exists && (
            <p className="text-sm text-amber-200 flex items-start gap-1.5">
              <Icon name="TriangleAlert" size={16} className="shrink-0 mt-0.5" />
              Такой код уже есть в базе — проверьте, что это та же модель
            </p>
          )}
          {warn.similar.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm text-amber-200 flex items-start gap-1.5">
                <Icon name="TriangleAlert" size={16} className="shrink-0 mt-0.5" />
                В базе есть очень похожий код — возможно, ошибка в цифрах:
              </p>
              {warn.similar.map((s) => (
                <div key={s.code} className="rounded-lg bg-black/20 px-2.5 py-1.5">
                  <div className="font-mono text-sm break-all">{s.code}</div>
                  <div className="text-xs text-muted-foreground break-words">
                    {s.name || "без наименования"} · {s.units} шт.
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-10 border-white/[0.1]"
              onClick={() => setWarn(null)}
            >
              <Icon name="Pencil" size={15} className="mr-1.5" />
              Исправить
            </Button>
            <Button className="flex-1 h-10" onClick={() => onDone(warn.code)}>
              Цифры верны, записать
            </Button>
          </div>
        </div>
      )}

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
