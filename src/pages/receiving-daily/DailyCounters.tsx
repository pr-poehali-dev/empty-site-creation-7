import Icon from "@/components/ui/icon";
import type { Counters } from "./dailyApi";

const CELLS = [
  { key: "sale", title: "На продажу", icon: "PackageCheck", color: "text-emerald-400", bg: "bg-emerald-500/15", ring: "ring-emerald-400" },
  { key: "wipe", title: "На протирку", icon: "Sparkles", color: "text-sky-400", bg: "bg-sky-500/15", ring: "ring-sky-400" },
  { key: "repair", title: "Под ремонт", icon: "Wrench", color: "text-amber-400", bg: "bg-amber-500/15", ring: "ring-amber-400" },
  { key: "scrap", title: "В утиль", icon: "Trash2", color: "text-rose-400", bg: "bg-rose-500/15", ring: "ring-rose-400" },
] as const;

export const counterTitle = (key: string) => CELLS.find((c) => c.key === key)?.title || "";

interface Props {
  counters: Counters;
  /** Выбранная плитка — список ниже показывает только её. */
  active?: string;
  /** Нажали плитку: та же — снять фильтр, другая — переключить. */
  onPick?: (key: string) => void;
}

const DailyCounters = ({ counters, active = "", onPick }: Props) => (
  <div className="grid grid-cols-4 gap-2">
    {CELLS.map((c) => {
      const n = counters[c.key] ?? 0;
      const on = active === c.key;
      const clickable = Boolean(onPick) && (n > 0 || on);
      return (
        <button
          type="button"
          key={c.key}
          disabled={!clickable}
          onClick={() => onPick?.(on ? "" : c.key)}
          className={`rounded-xl ${c.bg} p-2 flex flex-col items-center justify-center gap-1 transition ${
            on ? `ring-2 ${c.ring}` : ""
          } ${clickable ? "hover:brightness-125 active:scale-[0.97]" : "cursor-default"} ${
            active && !on ? "opacity-50" : ""
          }`}
        >
          <Icon name={c.icon} size={16} className={c.color} />
          <div className={`text-xl font-semibold leading-none ${c.color}`}>{n}</div>
          <div className="text-[10px] text-muted-foreground text-center leading-tight">
            {c.title}
          </div>
        </button>
      );
    })}
  </div>
);

export default DailyCounters;
