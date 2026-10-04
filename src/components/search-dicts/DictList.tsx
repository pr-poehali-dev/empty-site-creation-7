import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

interface Item {
  id: number;
  name: string;
  aliases?: string[];
  products: number;
}

interface Props {
  items: Item[];
  withAliases?: boolean;
  emptyText: string;
  onCreate: (name: string, aliases: string[]) => Promise<boolean>;
  onUpdate: (id: number, name: string, aliases: string[]) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  onParse?: (id: number) => void;
}

const splitAliases = (s: string) =>
  s.split(",").map((a) => a.trim()).filter(Boolean);

const DictList = ({ items, withAliases, emptyText, onCreate, onUpdate, onDelete, onParse }: Props) => {
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [busy, setBusy] = useState(false);

  const start = (it?: Item) => {
    setEditId(it ? it.id : "new");
    setName(it?.name || "");
    setAliases((it?.aliases || []).join(", "));
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const ok =
      editId === "new"
        ? await onCreate(name.trim(), splitAliases(aliases))
        : await onUpdate(editId as number, name.trim(), splitAliases(aliases));
    setBusy(false);
    if (ok) setEditId(null);
  };

  const remove = async (it: Item) => {
    if (!confirm(`Удалить «${it.name}»?`)) return;
    setBusy(true);
    await onDelete(it.id);
    setBusy(false);
  };

  const form = (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название"
        className="h-10 rounded-xl bg-secondary border-white/[0.08]"
      />
      {withAliases && (
        <>
          <Input
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="Варианты написания через запятую: Maunfeld, МАУНФЕЛД"
            className="h-10 rounded-xl bg-secondary border-white/[0.08]"
          />
          <p className="text-[11px] text-muted-foreground">
            По этим вариантам разбор узнаёт бренд в названии товара и в строке счёта. Регистр не важен.
          </p>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditId(null)} disabled={busy}>Отмена</Button>
        <Button size="sm" onClick={save} disabled={busy || !name.trim()}>
          {busy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
          <span className="ml-1">Сохранить</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {editId === "new" ? form : (
        <Button variant="outline" className="rounded-xl" onClick={() => start()}>
          <Icon name="Plus" size={14} />
          <span className="ml-1">Добавить</span>
        </Button>
      )}
      {items.length === 0 && editId !== "new" && (
        <p className="text-sm text-muted-foreground py-6 text-center">{emptyText}</p>
      )}
      {items.map((it) =>
        editId === it.id ? (
          <div key={it.id}>{form}</div>
        ) : (
          <div key={it.id} className="rounded-xl border border-white/[0.08] p-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{it.name}</p>
              {withAliases && it.aliases && it.aliases.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5 break-words">{it.aliases.join(", ")}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">Товаров: {it.products}</p>
            </div>
            {onParse && (
              <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => onParse(it.id)}>
                <Icon name="ScanSearch" size={14} />
                <span className="ml-1">Разобрать</span>
              </Button>
            )}
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.06] text-muted-foreground"
              onClick={() => start(it)}
              title="Изменить"
            >
              <Icon name="Pencil" size={14} />
            </button>
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
              onClick={() => remove(it)}
              disabled={busy}
              title="Удалить"
            >
              <Icon name="Trash2" size={14} />
            </button>
          </div>
        ),
      )}
    </div>
  );
};

export default DictList;