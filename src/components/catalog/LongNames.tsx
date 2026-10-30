import { useState } from "react";
import Icon from "@/components/ui/icon";

export const NAME_MAX = 100;

interface Item {
  row?: number;
  article: string;
  name: string;
}

interface Props {
  items: Item[];
  names: Record<number, string>;
  onChange: (row: number, name: string) => void;
}

const LongNames = ({ items, names, onChange }: Props) => {
  const [open, setOpen] = useState(true);
  const nameOf = (x: Item) => (x.row !== undefined && names[x.row] !== undefined ? names[x.row] : x.name);
  const list = items.filter((x) => x.row !== undefined && x.name.trim().length > NAME_MAX);
  if (!list.length) return null;
  const left = list.filter((x) => nameOf(x).trim().length > NAME_MAX).length;

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${left ? "border-rose-500/40 bg-rose-500/[0.06]" : "border-emerald-500/30 bg-emerald-500/[0.05]"}`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-1.5 text-sm text-left">
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} />
        <span className={left ? "text-rose-400" : "text-emerald-400"}>
          Наименование &gt; {NAME_MAX}: {left}
        </span>
        {left < list.length && <span className="text-xs text-muted-foreground">· исправлено {list.length - left} из {list.length}</span>}
      </button>
      {open && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Только новые товары. Сократите название прямо здесь — пока длиннее {NAME_MAX} знаков, загрузка недоступна.
          </p>
          {list.map((x) => {
            const v = nameOf(x);
            const len = v.trim().length;
            const bad = len > NAME_MAX || !len;
            return (
              <div key={x.row} className="space-y-1">
                {x.article && <div className="text-[11px] text-muted-foreground">{x.article}</div>}
                <textarea
                  value={v}
                  rows={2}
                  onChange={(e) => onChange(x.row as number, e.target.value)}
                  className={`w-full rounded-lg border bg-secondary px-2 py-1.5 text-sm outline-none resize-y ${
                    bad ? "border-rose-500 focus:ring-1 focus:ring-rose-500" : "border-white/[0.08] focus:border-primary"
                  }`}
                />
                <div className={`text-right text-[11px] tabular-nums ${bad ? "text-rose-400 font-semibold" : "text-muted-foreground"}`}>
                  {len} / {NAME_MAX}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LongNames;
