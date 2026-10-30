import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ArtResult, Twin, WbItem, normArt } from "./api";

interface Props {
  items: WbItem[];
  twins: Record<string, Twin[]> | null;
  twinsLoading: boolean;
  written: Record<string, ArtResult>;
  writing: boolean;
  onWrite: () => void;
}

export const twinsOf = (x: WbItem, items: WbItem[], twins: Record<string, Twin[]> | null) => {
  if (!x.article_auto) return [];
  const n = normArt(x.article);
  const fromBase = (twins?.[x.article] || []).filter((t) => t.key !== x.key);
  const seen = new Set(fromBase.map((t) => t.key));
  const fromFile = items
    .filter((o) => o.key !== x.key && !seen.has(o.key) && o.article && normArt(o.article) === n)
    .map((o) => ({ key: o.key, name: o.name, article: o.article, group: "в этом файле" }));
  return [...fromBase, ...fromFile];
};

export const TwinList = ({ list }: { list: Twin[] }) => (
  <ul className="mt-1 ml-4 space-y-0.5 text-muted-foreground">
    {list.map((t) => (
      <li key={t.key}>
        <span className="text-foreground">{t.article}</span> · {t.name}
        {t.group ? <span className="opacity-70"> · {t.group}</span> : null}
      </li>
    ))}
  </ul>
);

const Row = ({ x, list }: { x: WbItem; list: Twin[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" onClick={() => list.length && setOpen(!open)} className="text-left">
        <span className="text-sky-400">{x.article}</span> · {x.name}
        {list.length > 0 && (
          <span className="ml-1 rounded px-1 bg-amber-500/15 text-amber-400 whitespace-nowrap">
            Совпадает: {list.length} {open ? "▴" : "▾"}
          </span>
        )}
      </button>
      {open && <TwinList list={list} />}
    </li>
  );
};

const Group = ({ title, list, all, twins, tone }: { title: string; list: WbItem[]; all: WbItem[]; twins: Record<string, Twin[]> | null; tone: string }) => {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(!open)} className={`${tone} flex items-center gap-1`}>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} />
        {title}: {list.length}
      </button>
      {open && (
        <ul className="mt-1 ml-4 space-y-1 text-muted-foreground">
          {list.map((x) => (
            <Row key={x.key} x={x} list={twinsOf(x, all, twins)} />
          ))}
        </ul>
      )}
    </div>
  );
};

const AutoArticles = ({ items, twins, twinsLoading, written, writing, onWrite }: Props) => {
  const auto = useMemo(() => items.filter((x) => x.article_auto), [items]);
  const same = useMemo(() => auto.filter((x) => twinsOf(x, items, twins).length), [auto, items, twins]);
  const pending = auto.filter((x) => written[x.key]?.state !== "written");
  const res = Object.values(written);
  const cnt = (s: ArtResult["state"]) => res.filter((r) => r.state === s).length;
  const errors = res.filter((r) => r.state === "error");
  const [showErr, setShowErr] = useState(false);
  if (!auto.length) return null;

  return (
    <div className="space-y-1">
      <Group title="Артикул создан из названия" list={auto} all={items} twins={twins} tone="text-sky-400" />
      {twinsLoading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Icon name="Loader2" size={12} className="animate-spin" />
          Ищу совпадения артикулов в 1С…
        </div>
      ) : (
        <Group title="Артикул совпал с другим товаром" list={same} all={items} twins={twins} tone="text-amber-400" />
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onWrite} disabled={writing || !pending.length}>
          <Icon name={writing ? "Loader2" : "Upload"} size={14} className={writing ? "animate-spin" : ""} />
          {writing ? "Записываю в 1С…" : `Записать артикулы в 1С (${pending.length})`}
        </Button>
        {res.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Записано: <span className="text-emerald-400">{cnt("written")}</span> · пропущено (в 1С уже заполнен):{" "}
            {cnt("skipped")} ·{" "}
            <button type="button" className={errors.length ? "text-rose-400 underline" : ""} onClick={() => setShowErr(!showErr)}>
              ошибки: {errors.length}
            </button>
          </span>
        )}
      </div>
      {showErr && errors.length > 0 && (
        <ul className="text-xs ml-4 space-y-0.5 text-rose-400">
          {errors.map((e) => {
            const x = items.find((i) => i.key === e.key);
            return (
              <li key={e.key}>
                {x?.article} · {x?.name} — {e.error}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AutoArticles;
