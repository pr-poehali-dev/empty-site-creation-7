import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { loadHistory, type MoveRow } from "./stockApi";

interface Props {
  itemId: number;
}

const fmt = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Весь путь единицы. Когда товар «потерялся» — видно, кто двинул последним. */
const UnitHistory = ({ itemId }: Props) => {
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [check, setCheck] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    loadHistory(itemId)
      .then((d) => {
        if (!alive) return;
        setMoves(d.moves);
        setCheck(d.check);
      })
      .catch(() => undefined)
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [itemId]);

  if (busy) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
        <Icon name="Loader2" size={13} className="animate-spin" />
        Загружаю историю
      </div>
    );
  }

  const checkedAt = check?.checked_at as string | null;

  return (
    <div className="px-3 py-2 space-y-1.5">
      {moves.map((m) => (
        <div key={m.id} className="flex items-start gap-2 text-xs">
          <Icon
            name={m.source === "check" ? "UserCheck" : "ArrowRight"}
            size={12}
            className={`mt-0.5 shrink-0 ${
              m.source === "check" ? "text-emerald-400" : "text-sky-400"
            }`}
          />
          <span className="text-muted-foreground">
            {m.warehouse_from || "не было склада"} → {m.warehouse_to}
            {m.source === "check" ? " (приёмка)" : ""}
            {m.moved_by_name ? ` · ${m.moved_by_name}` : ""} · {fmt(m.moved_at)}
          </span>
        </div>
      ))}

      {checkedAt && (
        <div className="flex items-start gap-2 text-xs">
          <Icon name="CircleCheck" size={12} className="mt-0.5 text-emerald-400 shrink-0" />
          <span className="text-muted-foreground">
            Проверена
            {check?.checked_by_name ? ` · ${check.checked_by_name as string}` : ""} ·{" "}
            {fmt(checkedAt)}
          </span>
        </div>
      )}

      {moves.length === 0 && !checkedAt && (
        <p className="text-xs text-muted-foreground">Перемещений не было</p>
      )}
    </div>
  );
};

export default UnitHistory;