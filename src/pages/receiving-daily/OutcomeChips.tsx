import Icon from "@/components/ui/icon";
import type { Counters } from "./dailyApi";

const CHIPS = [
  { key: "sale", icon: "PackageCheck", cls: "text-emerald-400", title: "На продажу" },
  { key: "wipe", icon: "Sparkles", cls: "text-sky-400", title: "На протирку" },
  { key: "repair", icon: "Wrench", cls: "text-amber-400", title: "Под ремонт" },
  { key: "scrap", icon: "Trash2", cls: "text-rose-400", title: "В утиль" },
] as const;

interface Props {
  counters?: Counters;
  /** Пустые исходы обычно прячем, но в общем списке колонки должны совпадать. */
  showZero?: boolean;
}

/** Чем кончилась приёмка — четырьмя значками, без захода внутрь. */
const OutcomeChips = ({ counters, showZero = false }: Props) => {
  if (!counters) return null;
  const cells = CHIPS.filter((c) => showZero || (counters[c.key] ?? 0) > 0);
  if (cells.length === 0) {
    return <span className="text-xs text-muted-foreground">пусто</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {cells.map((c) => (
        <span key={c.key} className="flex items-center gap-0.5" title={c.title}>
          <Icon name={c.icon} size={13} className={c.cls} />
          <span className={`text-xs tabular-nums ${c.cls}`}>{counters[c.key] ?? 0}</span>
        </span>
      ))}
    </div>
  );
};

export default OutcomeChips;
