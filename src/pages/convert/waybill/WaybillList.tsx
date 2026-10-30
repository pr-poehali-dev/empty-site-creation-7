import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { WbDoc } from "./api";

interface Props {
  docs: WbDoc[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSet: (keys: string[], on: boolean) => void;
  disabled?: boolean;
}

const low = (s: string) => s.toLowerCase().replace(/ё/g, "е");
const money = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const day = (s: string) => (s ? s.slice(0, 10).split("-").reverse().join(".") : "");

const WaybillList = ({ docs, selected, onToggle, onSet, disabled }: Props) => {
  const [num, setNum] = useState("");
  const [cp, setCp] = useState("");
  const [comment, setComment] = useState("");

  const shown = useMemo(
    () =>
      docs.filter(
        (d) =>
          (!num.trim() || low(d.number).includes(low(num.trim()))) &&
          (!cp.trim() || low(d.counterparty).includes(low(cp.trim()))) &&
          (!comment.trim() || low(d.comment).includes(low(comment.trim()))),
      ),
    [docs, num, cp, comment],
  );
  const allShown = shown.length > 0 && shown.every((d) => selected.has(d.key));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="Номер" />
        <Input value={cp} onChange={(e) => setCp(e.target.value)} placeholder="Контрагент" />
        <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий" />
      </div>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-muted-foreground">
          Показано {shown.length} из {docs.length}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !shown.length}
          onClick={() => onSet(shown.map((d) => d.key), !allShown)}
        >
          {allShown ? "Снять с показанных" : "Выбрать все показанные"}
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onSet([...selected], false)}>
            Снять все ({selected.size})
          </Button>
        )}
      </div>
      <div className="rounded-lg border border-white/[0.08] divide-y divide-white/[0.06] max-h-[480px] overflow-y-auto">
        {shown.map((d) => (
          <label
            key={d.key}
            className={`flex items-start gap-3 p-2.5 cursor-pointer hover:bg-white/[0.03] ${
              selected.has(d.key) ? "bg-primary/[0.07]" : ""
            }`}
          >
            <Checkbox
              checked={selected.has(d.key)}
              disabled={disabled}
              onCheckedChange={() => onToggle(d.key)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="font-medium">{d.number}</span>
                <span className="text-muted-foreground">{day(d.date)}</span>
                <span className="ml-auto tabular-nums">{money(d.amount)} ₽</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">{d.counterparty || "—"}</div>
              <div className="flex flex-wrap gap-x-3 text-xs">
                {d.comment && <span className="text-foreground/80">{d.comment}</span>}
                {!d.posted && <span className="text-amber-400">не проведена</span>}
              </div>
            </div>
          </label>
        ))}
        {!shown.length && <div className="p-4 text-sm text-muted-foreground text-center">Ничего не найдено</div>}
      </div>
    </div>
  );
};

export default WaybillList;
