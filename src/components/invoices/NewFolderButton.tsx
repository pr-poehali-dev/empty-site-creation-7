import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

interface Props {
  existing: string[];
  onApply: (name: string) => void;
  size?: "sm" | "md";
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

const NewFolderButton = ({ existing, onApply, size = "md" }: Props) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const h = size === "sm" ? "h-8 text-xs" : "h-10";

  const apply = () => {
    const n = norm(name);
    if (!n) return;
    const same = existing.find((f) => norm(f).toLowerCase() === n.toLowerCase());
    onApply(same || n);
    setName("");
    setOpen(false);
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className={`rounded-xl gap-1.5 ${h}`} onClick={() => setOpen(true)}>
        <Icon name="FolderPlus" size={14} />
        Новая папка
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") apply(); if (e.key === "Escape") setOpen(false); }}
        placeholder="Название папки"
        className={`rounded-xl w-44 ${h}`}
      />
      <Button type="button" size="sm" className={`rounded-xl ${h}`} disabled={!norm(name)} onClick={apply}>
        Применить
      </Button>
      <Button type="button" variant="ghost" size="icon" className={h} onClick={() => setOpen(false)}>
        <Icon name="X" size={14} />
      </Button>
    </div>
  );
};

export default NewFolderButton;
