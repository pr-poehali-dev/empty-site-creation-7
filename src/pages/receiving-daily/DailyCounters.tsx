import Icon from "@/components/ui/icon";
import type { Counters } from "./dailyApi";

const CELLS = [
  { key: "sale", title: "На продажу", icon: "PackageCheck", color: "text-emerald-400", bg: "bg-emerald-500/15" },
  { key: "wipe", title: "На протирку", icon: "Sparkles", color: "text-sky-400", bg: "bg-sky-500/15" },
  { key: "repair", title: "Под ремонт", icon: "Wrench", color: "text-amber-400", bg: "bg-amber-500/15" },
  { key: "scrap", title: "В утиль", icon: "Trash2", color: "text-rose-400", bg: "bg-rose-500/15" },
] as const;

interface Props {
  counters: Counters;
}

const DailyCounters = ({ counters }: Props) => (
  <div className="grid grid-cols-4 gap-2">
    {CELLS.map((c) => (
      <div
        key={c.key}
        className={`rounded-xl ${c.bg} p-2 flex flex-col items-center justify-center gap-1`}
      >
        <Icon name={c.icon} size={16} className={c.color} />
        <div className={`text-xl font-semibold leading-none ${c.color}`}>
          {counters[c.key] ?? 0}
        </div>
        <div className="text-[10px] text-muted-foreground text-center leading-tight">
          {c.title}
        </div>
      </div>
    ))}
  </div>
);

export default DailyCounters;
