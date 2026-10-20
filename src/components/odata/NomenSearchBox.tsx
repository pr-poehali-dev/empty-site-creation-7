import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import AutoTextarea from "./AutoTextarea";
import { FoundNomen, SearchResult, fmtWeight, searchNomen } from "@/pages/odata/nomenApi";

const STEP = 10;

interface Props {
  base: string;
  value: string;
  found?: SearchResult;
  onValue: (v: string) => void;
  onFound: (r: SearchResult) => void;
  onPick: (f: FoundNomen) => void;
}

const NomenSearchBox = ({ base, value, found, onValue, onFound, onPick }: Props) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(STEP);
  const [open, setOpen] = useState(true);

  const run = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await searchNomen(base, value.trim());
      onFound(r);
      setShown(STEP);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const items = found?.items || [];

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">Поиск похожей номенклатуры в 1С (ключевые слова)</span>
      <div className="flex items-start gap-2">
        <AutoTextarea value={value} onChange={onValue} onEnter={run} placeholder="например: кастрюл набор сталь" />
        <Button type="button" variant="outline" className="shrink-0" onClick={run} disabled={busy || !value.trim()}>
          <Icon name={busy ? "Loader2" : "Search"} size={14} className={busy ? "animate-spin" : ""} />
          Найти
        </Button>
      </div>
      {error && <div className="text-xs text-rose-400">{error}</div>}
      {found && (
        <div className="text-xs">
          <button
            type="button"
            className="text-primary flex items-center gap-1"
            onClick={() => setOpen((v) => !v)}
            disabled={!items.length}
          >
            {items.length > 0 && <Icon name={open ? "ChevronUp" : "ChevronDown"} size={13} />}
            Найдено в 1С: {found.similar}
            {found.similar > items.length ? ` (показываю первые ${items.length})` : ""}
          </button>
          {open && items.length > 0 && (
            <div className="mt-1.5 rounded-lg border border-white/[0.08] overflow-x-auto">
              <div className="min-w-full w-max divide-y divide-white/[0.06]">
              {items.slice(0, shown).map((f) => (
                <button
                  type="button"
                  key={f.code + f.name}
                  onClick={() => onPick(f)}
                  className="w-full text-left flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.04]"
                  title="Подставить код ТНВЭД и вес"
                >
                  <span className="flex-1 whitespace-nowrap text-muted-foreground">{f.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{f.tnved || "—"}</span>
                  <span className="shrink-0 tabular-nums w-16 text-right">{f.w ? `${fmtWeight(f.w)} кг` : "—"}</span>
                </button>
              ))}
              {shown < items.length && (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-primary text-left"
                  onClick={() => setShown((n) => n + STEP * 2)}
                >
                  Показать ещё ({items.length - shown})
                </button>
              )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NomenSearchBox;