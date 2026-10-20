import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import { Group1C, createGroup } from "@/pages/odata/nomenApi";

const ROOT = "__root";

interface Props {
  base: string;
  groups: Group1C[];
  onCreated: (g: Group1C) => void;
}

const NomenGroupCreate = ({ base, groups, onCreated }: Props) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState(ROOT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setParent(ROOT);
    setError("");
  };

  const save = async () => {
    if (!name.trim()) return setError("Укажите наименование группы");
    setBusy(true);
    setError("");
    try {
      const p = parent === ROOT ? "" : parent;
      const g = await createGroup(base, name.trim(), p);
      const pp = groups.find((x) => x.key === p)?.path;
      onCreated({ key: g.key, name: g.name, path: pp ? `${pp} / ${g.name}` : g.name });
      setOpen(false);
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        title="Новая группа"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Icon name="FolderPlus" size={16} />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Новая группа номенклатуры</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Наименование</span>
              <Input
                className="text-sm md:text-sm"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Родитель</span>
              <Select value={parent} onValueChange={setParent}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT}>Без родителя (в корне)</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.key} value={g.key}>
                      {g.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {error && <div className="text-xs text-rose-400">{error}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Отмена
              </Button>
              <Button onClick={save} disabled={busy || !name.trim()}>
                {busy && <Icon name="Loader2" size={14} className="animate-spin" />}
                Создать в 1С
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NomenGroupCreate;
