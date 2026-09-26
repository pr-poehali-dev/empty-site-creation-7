import Icon from "@/components/ui/icon";
import { OUTCOME_WAREHOUSE, type DailyItem, type ItemMove } from "./dailyApi";

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
  kind,
}: {
  who: string;
  where: string;
  when: string;
  kind: string;
}) => (
  <div className="flex items-baseline gap-2 text-xs">
    <Icon
      name={
        kind === "check" ? "UserCheck" : kind === "remove" ? "Undo2" : "ArrowRight"
      }
      size={12}
      className={`shrink-0 self-center ${
        kind === "check"
          ? "text-emerald-400"
          : kind === "remove"
            ? "text-muted-foreground"
            : "text-amber-400"
      }`}
    />
    <span className="truncate">{who}</span>
    <span className="text-muted-foreground">—</span>
    <span className={kind === "remove" ? "text-muted-foreground" : "font-medium"}>
      {where}
      {kind === "check" && (
        <span className="text-emerald-300/80 font-normal"> (приёмка)</span>
      )}
    </span>
    <span className="text-muted-foreground ml-auto shrink-0">{when}</span>
  </div>
);

/** Путь товара целиком из записей: приёмка, перемещения, возвраты в пул.
 *
 * Решение мастера подставляем отдельной строкой только для старых позиций,
 * проверенных до того, как заход через приёмку стали записывать. */
const MoveHistory = ({ item }: { item: DailyItem }) => {
  const moves: ItemMove[] = item.moves || [];
  const planned = OUTCOME_WAREHOUSE[item.check_result || ""];
  const hasCheck = moves.some((m) => m.source === "check");
  const legacy = Boolean(planned && !hasCheck);

  if (!moves.length && !legacy) {
    return (
      <div className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2">
        <p className="text-[11px] text-muted-foreground">Движений пока нет</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 space-y-1.5">
      {legacy && (
        <Line
          kind="check"
          who={item.checked_by_name || "мастер"}
          where={planned}
          when={dt(item.checked_at)}
        />
      )}
      {moves.map((m, i) => (
        <Line
          key={i}
          kind={m.source || "move"}
          who={m.moved_by_name || "сотрудник"}
          where={m.warehouse_to}
          when={dt(m.moved_at)}
        />
      ))}
    </div>
  );
};

export default MoveHistory;
