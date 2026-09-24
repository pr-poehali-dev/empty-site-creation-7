import Icon from "@/components/ui/icon";
import type { DailyItem } from "./dailyApi";

interface Props {
  item: DailyItem;
  onPick: (hasPackage: boolean) => void;
}

const fmt = (v: number | null) =>
  v === null || v === undefined ? "нет в файле" : `${Number(v)} кг`;

/** Первый вопрос сразу после выстрела сканера. Вес берётся из файла, никто не взвешивает. */
const CheckPackageStep = ({ item, onPick }: Props) => (
  <div className="space-y-3">
    <div className="text-center">
      <div className="w-12 h-12 rounded-2xl bg-sky-500/15 flex items-center justify-center mx-auto mb-2">
        <Icon name="Package" size={22} className="text-sky-400" />
      </div>
      <p className="text-lg font-semibold">Упаковка есть?</p>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={() => onPick(true)}
        className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.15] transition-colors p-4 text-center"
      >
        <div className="text-base font-semibold text-emerald-300">Да</div>
        <div className="text-xs text-muted-foreground mt-1">
          в накладную брутто
        </div>
        <div className="text-xs text-emerald-200/70 mt-0.5">
          {fmt(item.weight_gross)}
        </div>
      </button>
      <button
        onClick={() => onPick(false)}
        className="rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.07] transition-colors p-4 text-center"
      >
        <div className="text-base font-semibold">Нет</div>
        <div className="text-xs text-muted-foreground mt-1">
          в накладную нетто
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {fmt(item.weight_net)}
        </div>
      </button>
    </div>
  </div>
);

export default CheckPackageStep;
