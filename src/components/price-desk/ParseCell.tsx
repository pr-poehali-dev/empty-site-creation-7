import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { PARSE_TEXT, type DeskItem } from "@/lib/priceDesk";

interface Props {
  item: DeskItem;
  busy: boolean;
  onParse: () => void;
  onSave: (brand: string, model: string) => Promise<void>;
}

const ParseCell = ({ item, busy, onParse, onSave }: Props) => {
  const [edit, setEdit] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);

  if (edit) {
    const save = async () => {
      setSaving(true);
      try {
        await onSave(brand, model);
        setEdit(false);
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="flex items-center gap-1">
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Бренд" className="h-7 w-28 text-xs" />
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEdit(false);
          }}
          placeholder="Модель"
          className="h-7 w-32 text-xs"
        />
        <Button size="sm" className="h-7 w-7 p-0" onClick={save} disabled={saving}>
          <Icon name={saving ? "Loader2" : "Check"} size={13} className={saving ? "animate-spin" : ""} />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEdit(false)} disabled={saving}>
          <Icon name="X" size={13} />
        </Button>
      </div>
    );
  }

  const st = item.is_new ? null : PARSE_TEXT[item.parse_status || "none"];
  return (
    <div className="flex items-start gap-1.5">
      <button
        type="button"
        onClick={() => {
          setBrand(item.brand || "");
          setModel(item.model || "");
          setEdit(true);
        }}
        title="Нажмите, чтобы поправить бренд и модель"
        className="text-left rounded px-1 -mx-1 hover:bg-white/[0.06] min-w-[120px]"
      >
        {item.brand || item.model ? (
          <span className="block">
            <span className="text-muted-foreground">{item.brand || "—"}</span>{" "}
            <span className="font-medium">{item.model || "без модели"}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">ввести</span>
        )}
        {st && <span className={`block text-[10px] ${st.cls}`}>{st.label}</span>}
        {item.is_new && <span className="block text-[10px] text-muted-foreground">только в этом наборе</span>}
      </button>
      {!item.is_new && item.parse_status !== "manual" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-sky-300"
          title="Разобрать наименование"
          disabled={busy}
          onClick={onParse}
        >
          <Icon name={busy ? "Loader2" : "ScanText"} size={14} className={busy ? "animate-spin" : ""} />
        </Button>
      )}
    </div>
  );
};

export default ParseCell;
