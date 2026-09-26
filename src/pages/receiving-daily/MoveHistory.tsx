import Icon from "@/components/ui/icon";
import { OUTCOME_WAREHOUSE, type DailyItem } from "./dailyApi";

const dt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const Line = ({
  who,
  where,
  when,
  first,
}: {
  who: string;
  where: string;
  when: string;
  first?: boolean;
}) => (
  <div className="flex items-baseline gap-2 text-xs">
    <Icon
      name={first ? "UserCheck" : "ArrowRight"}
      size={12}
      className={`shrink-0 self-center ${first ? "text-emerald-400" : "text-amber-400"}`}
    />
    <span className="truncate">{who}</span>
    <span className="text-muted-foreground">—</span>
    <span className="font-medium">{where}</span>
    <span className="text-muted-foreground ml-auto shrink-0">{when}</span>
  </div>
);

/** Путь товара: первая строка — решение мастера, дальше перемещения по складам. */
const MoveHistory = ({ item }: { item: DailyItem }) => {
  const planned = OUTCOME_WAREHOUSE[item.check_result || ""];
  const moves = item.moves || [];

  return (
    <div className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 space-y-1.5">
      {planned && (
        <Line
          first
          who={item.checked_by_name || "мастер"}
          where={planned}
          when={dt(item.checked_at)}
        />
      )}
      {moves.map((m, i) => (
        <Line
          key={i}
          who={m.moved_by_name || "сотрудник"}
          where={m.warehouse_to}
          when={dt(m.moved_at)}
        />
      ))}
      {!moves.length && (
        <p className="text-[11px] text-muted-foreground">
          Со склада не перемещали
        </p>
      )}
    </div>
  );
};

export default MoveHistory;
