import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

export type ConflictAction = "update" | "move" | "new" | "skip";

export interface ConflictCard {
  id: number;
  article: string;
  name: string;
  group: string;
}

export interface GroupConflict {
  row: number;
  article: string;
  name: string;
  expected_group: string;
  action: ConflictAction | null;
  product_id: number;
  cards: ConflictCard[];
}

export const ACTIONS: { v: ConflictAction; t: string; short: string }[] = [
  { v: "update", t: "Это он, обновить карточку", short: "Обновить" },
  { v: "move", t: "Это он, перенести в мою группу", short: "Перенести" },
  { v: "new", t: "Это другой товар, создать новый", short: "Создать новый" },
  { v: "skip", t: "Пропустить", short: "Пропустить" },
];

interface Props {
  items: GroupConflict[];
  busy?: boolean;
  onDecide: (rows: { row: number; action: ConflictAction; product_id: number }[]) => void;
}

const Row = ({ c, busy, onDecide }: { c: GroupConflict; busy?: boolean; onDecide: Props["onDecide"] }) => {
  const [pid, setPid] = useState(c.product_id);
  const card = c.cards.find((x) => x.id === pid) || c.cards[0];
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${c.action ? "border-white/[0.08]" : "border-amber-500/40 bg-amber-500/[0.06]"}`}>
      <div className="text-sm">
        <span className="font-medium">{c.article || "—"}</span> · {c.name}
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>
          Ожидалась группа: <span className="text-foreground">{c.expected_group}</span>
        </div>
        {c.cards.length > 1 ? (
          <div className="space-y-1">
            <div>Найдено в каталоге: {c.cards.length}</div>
            {c.cards.map((x) => (
              <label key={x.id} className="flex items-start gap-2 cursor-pointer">
                <input type="radio" className="mt-0.5" checked={x.id === pid} onChange={() => setPid(x.id)} />
                <span>
                  <span className="text-foreground">{x.article}</span> · {x.name} ·{" "}
                  <span className="text-amber-400">{x.group || "без группы"}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div>
            Найдено: <span className="text-foreground">{card.name}</span> в группе{" "}
            <span className="text-amber-400">{card.group || "без группы"}</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a.v}
            type="button"
            disabled={busy}
            onClick={() => onDecide([{ row: c.row, action: a.v, product_id: card.id }])}
            className={`rounded-lg border px-2 py-1.5 text-xs text-left ${
              c.action === a.v ? "border-primary bg-primary/10 text-primary" : "border-white/[0.08] bg-secondary"
            }`}
          >
            {a.t}
          </button>
        ))}
      </div>
    </div>
  );
};

const GroupConflicts = ({ items, busy, onDecide }: Props) => {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  const left = items.filter((x) => !x.action).length;
  return (
    <div className="rounded-xl border border-amber-500/30 p-3 space-y-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-sm font-medium text-amber-400">
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={16} />
        Найден в другой группе: {items.length}
        {left > 0 && <span className="ml-auto text-xs text-rose-400">Нужно решение: {left}</span>}
      </button>
      {open && (
        <>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Применить ко всем:</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ACTIONS.map((a) => (
                <Button
                  key={a.v}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  className="rounded-lg text-xs h-auto py-1.5 whitespace-normal"
                  onClick={() => onDecide(items.map((x) => ({ row: x.row, action: a.v, product_id: x.product_id })))}
                >
                  {a.short}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {items.map((c) => (
              <Row key={c.row} c={c} busy={busy} onDecide={onDecide} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default GroupConflicts;
