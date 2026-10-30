import { useState } from "react";
import Icon from "@/components/ui/icon";
import { CatCard, CatMatch, MATCH_FIELDS, WbItem } from "./api";

export const Marks = ({ c }: { c: CatCard }) => (
  <span className="ml-1 inline-flex gap-0.5 align-middle">
    {MATCH_FIELDS.filter((f) => c.matched.includes(f.value)).map((f) => (
      <span key={f.value} className="rounded px-1 text-[10px] bg-emerald-500/20 text-emerald-300" title={f.label}>
        {f.short}
      </span>
    ))}
    {c.in_name && <span className="rounded px-1 text-[10px] bg-amber-500/15 text-amber-400">в названии</span>}
  </span>
);

export const CardList = ({ cards }: { cards: CatCard[] }) => (
  <ul className="mt-1 ml-4 space-y-0.5 text-muted-foreground">
    {cards.map((c) => (
      <li key={c.id}>
        <span className="text-foreground">{c.article || "—"}</span> · {c.name}
        {c.group ? <span className="opacity-70"> · {c.group}</span> : null}
        <Marks c={c} />
      </li>
    ))}
  </ul>
);

const TONE = {
  found: "text-emerald-400",
  partial: "text-amber-400",
  missing: "text-rose-400",
};

const TITLE = {
  found: "Найдено",
  partial: "Частично",
  missing: "Нет в каталоге",
};

const Group = ({ status, items, cat }: { status: CatMatch["status"]; items: WbItem[]; cat: Record<string, CatMatch> }) => {
  const [open, setOpen] = useState(false);
  const list = items.filter((x) => (cat[x.key]?.status || "missing") === status);
  if (!list.length) return null;
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(!open)} className={`${TONE[status]} flex items-center gap-1`}>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} />
        {TITLE[status]}: {list.length}
      </button>
      {open && (
        <ul className="mt-1 ml-4 space-y-1 text-muted-foreground">
          {list.map((x) => {
            const c = cat[x.key]?.cards || [];
            return (
              <li key={x.key}>
                <span className="text-foreground">{x.article || "—"}</span> · {x.name}
                {c.length > 0 && <CardList cards={c} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const CatalogSummary = ({ items, cat, loading }: { items: WbItem[]; cat: Record<string, CatMatch> | null; loading: boolean }) => {
  if (loading)
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon name="Loader2" size={12} className="animate-spin" />
        Сверяю с каталогом…
      </div>
    );
  if (!cat) return null;
  return (
    <div className="space-y-1">
      <Group status="found" items={items} cat={cat} />
      <Group status="partial" items={items} cat={cat} />
      <Group status="missing" items={items} cat={cat} />
    </div>
  );
};

export default CatalogSummary;
