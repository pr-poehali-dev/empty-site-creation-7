import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { SiteProduct } from "@/pages/odata/nomenApi";

interface Props {
  value: string;
  inputMode: "decimal" | "numeric";
  placeholder?: string;
  unit: string;
  siteName: string;
  lookup: (() => Promise<SiteProduct>) | null;
  pick: (p: SiteProduct) => number | null;
  missing: string;
  avg?: { value: string; hint: string } | null;
  onType: (v: string) => void;
  onSite: (v: number, p: SiteProduct) => void;
  onAvg?: () => void;
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

const NomenSiteField = ({ value, inputMode, placeholder, unit, siteName, lookup, pick, missing, avg, onType, onSite, onAvg }: Props) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ v: number; p: SiteProduct } | null>(null);
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const find = async () => {
    if (!lookup) return;
    setBusy(true);
    setMsg("");
    setFound(null);
    try {
      const p = await lookup();
      if (!p.found) setMsg(p.reason || "нет на сайте");
      else {
        const v = pick(p);
        if (v && v > 0) setFound({ v, p });
        else setMsg(missing);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "сайт не ответил");
    }
    setBusy(false);
  };

  const close = () => {
    setOpen(false);
    setFound(null);
    setMsg("");
  };

  const item = "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/[0.04]";

  return (
    <div
      ref={box}
      className="relative"
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <Input
        ref={ref}
        className="text-sm md:text-sm"
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(false);
        }}
      />
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 sm:right-auto sm:min-w-[260px] top-full mt-1 z-30 rounded-lg border border-white/[0.1] bg-popover shadow-lg divide-y divide-white/[0.06]"
        >
          {lookup && (
            <div>
              <button type="button" className={item} onClick={find} disabled={busy}>
                <Icon name={busy ? "Loader2" : "Globe"} size={14} className={busy ? "animate-spin" : "text-primary"} />
                Найти на сайте {siteName}
              </button>
              {found && (
                <div className="px-3 pb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums flex-1">
                    {fmt(found.v)} {unit}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      onSite(found.v, found.p);
                      close();
                    }}
                  >
                    Подставить
                  </Button>
                </div>
              )}
              {msg && <div className="px-3 pb-2 text-xs text-amber-400">{msg}</div>}
            </div>
          )}
          <button
            type="button"
            className={item}
            onClick={() => {
              close();
              ref.current?.focus();
            }}
          >
            <Icon name="Pencil" size={14} className="text-muted-foreground" />
            Ввести вручную
          </button>
          {avg && onAvg && (
            <button
              type="button"
              className={item}
              onClick={() => {
                onAvg();
                close();
              }}
            >
              <Icon name="Sigma" fallback="Calculator" size={14} className="text-muted-foreground" />
              <span className="flex-1">Среднее по похожим</span>
              <span className="tabular-nums">{avg.value}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default NomenSiteField;