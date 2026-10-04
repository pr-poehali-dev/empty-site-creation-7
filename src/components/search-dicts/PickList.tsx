import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Icon from "@/components/ui/icon";

export interface PickOption {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: PickOption[];
  placeholder: string;
  extra?: PickOption[];
  sort?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const PickList = ({ value, onChange, options, placeholder, extra = [], sort = true, size = "md", className = "" }: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const sorted = useMemo(
    () => (sort ? [...options].sort((a, b) => a.label.localeCompare(b.label, "ru", { sensitivity: "base" })) : options),
    [options, sort],
  );
  const all = [...extra, ...sorted];
  const current = all.find((o) => o.value === value);
  const ql = q.trim().toLowerCase();
  const visible = ql ? sorted.filter((o) => o.label.toLowerCase().includes(ql)) : all;
  const showSearch = options.length > 8;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };

  const h = size === "sm" ? "h-8 text-xs rounded-lg" : "h-10 text-sm rounded-xl";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${h} w-full bg-secondary border border-white/[0.08] px-3 flex items-center gap-2 text-left hover:bg-white/[0.06] transition-colors ${className}`}
        >
          <span className={`flex-1 truncate ${current && value ? "" : "text-muted-foreground"}`}>
            {current ? current.label : placeholder}
          </span>
          <Icon name="ChevronDown" size={14} className="text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[15rem] rounded-xl border-white/[0.08] bg-card"
      >
        {showSearch && (
          <div className="p-2 border-b border-white/[0.08]">
            <div className="relative">
              <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Найти…"
                className="w-full h-9 rounded-lg bg-secondary border border-white/[0.08] pl-8 pr-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
          </div>
        )}
        <div className="max-h-72 overflow-y-auto py-1">
          {visible.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground text-center">Ничего не найдено</p>}
          {visible.map((o) => (
            <button
              key={o.value || "__empty"}
              type="button"
              onClick={() => pick(o.value)}
              className={`w-full px-3 py-2 text-sm flex items-center gap-2 text-left hover:bg-white/[0.06] ${o.value === value ? "text-primary" : ""}`}
            >
              <Icon name="Check" size={14} className={o.value === value ? "opacity-100" : "opacity-0"} />
              <span className="flex-1 min-w-0 break-words">{o.label}</span>
              {o.count != null && <span className="text-xs text-muted-foreground shrink-0">{o.count}</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default PickList;
