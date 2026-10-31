import { useEffect, useState } from "react";
import { money } from "@/lib/receivingCatalog";
import { BASE_SOURCE_TEXT, type DeskItem } from "@/lib/priceDesk";

interface Props {
  item: DeskItem;
  onSave: (value: string) => Promise<void>;
}

const show = (v: number | string | null) => (v == null || v === "" ? "" : Number(v).toFixed(2));

const NewBaseCell = ({ item, onSave }: Props) => {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(show(item.new_base));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!edit) setText(show(item.new_base));
  }, [item.new_base, edit]);

  if (item.is_new) return <span className="text-[11px] text-muted-foreground">не в каталоге</span>;

  const save = async () => {
    if (text.trim() === show(item.new_base)) {
      setEdit(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(text.trim());
    } catch {
      setText(show(item.new_base));
    } finally {
      setBusy(false);
      setEdit(false);
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
            setText(show(item.new_base));
            setEdit(false);
          }
        }}
        className="h-7 w-24 rounded-md border border-white/20 bg-background px-2 text-sm tabular-nums"
      />
    );
  }

  return (
    <button
      onClick={() => setEdit(true)}
      title="Нажмите, чтобы ввести новую Базовую вручную. Пустое значение — очистить"
      className="min-w-[56px] text-left rounded px-1 -mx-1 hover:bg-white/[0.06]"
    >
      {item.new_base != null ? (
        <span className="tabular-nums text-emerald-200">{money(item.new_base)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      {item.new_base_source && (
        <span className="block text-[10px] text-muted-foreground">{BASE_SOURCE_TEXT[item.new_base_source]}</span>
      )}
    </button>
  );
};

export default NewBaseCell;
