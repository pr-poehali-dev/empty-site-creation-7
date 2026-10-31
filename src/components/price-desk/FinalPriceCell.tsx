import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { money } from "@/lib/receivingCatalog";

interface Props {
  value: number | string | null;
  manual: boolean;
  digits: 0 | 2;
  onSave: (value: string) => Promise<void>;
  onReset: () => Promise<void>;
}

const show = (v: number | string | null, digits: 0 | 2) => {
  if (v == null || v === "") return "";
  const n = Number(v);
  return digits === 0 ? String(Math.round(n)) : n.toFixed(2);
};

const FinalPriceCell = ({ value, manual, digits, onSave, onReset }: Props) => {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(show(value, digits));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!edit) setText(show(value, digits));
  }, [value, digits, edit]);

  const save = async () => {
    const t = text.trim();
    if (t === show(value, digits)) {
      setEdit(false);
      return;
    }
    setBusy(true);
    try {
      await (t === "" ? onReset() : onSave(t));
      setEdit(false);
    } catch {
      setText(show(value, digits));
      setEdit(false);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await onReset();
    } finally {
      setBusy(false);
    }
  };

  if (edit) {
    return (
      <input
        autoFocus
        inputMode="decimal"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(show(value, digits));
            setEdit(false);
          }
        }}
        className="h-7 w-24 rounded-md border border-white/20 bg-background px-2 text-sm tabular-nums"
      />
    );
  }

  return (
    <div className="flex items-start gap-1">
      <button
        onClick={() => setEdit(true)}
        title="Нажмите, чтобы исправить вручную"
        className="min-w-[56px] text-left rounded px-1 -mx-1 hover:bg-white/[0.06]"
      >
        {value != null && value !== "" ? (
          <span className="tabular-nums">{digits === 0 ? Math.round(Number(value)).toLocaleString("ru-RU") : money(value)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {manual && <span className="block text-[10px] text-sky-300">вручную</span>}
      </button>
      {manual && (
        <button
          onClick={reset}
          disabled={busy}
          title="Снять «вручную» и вернуть расчёт по формуле"
          className="mt-0.5 text-muted-foreground hover:text-foreground"
        >
          <Icon name={busy ? "Loader2" : "X"} size={12} className={busy ? "animate-spin" : ""} />
        </button>
      )}
    </div>
  );
};

export default FinalPriceCell;
