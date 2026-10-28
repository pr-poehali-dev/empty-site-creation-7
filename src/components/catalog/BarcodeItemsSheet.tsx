import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

export interface BarcodeItem {
  barcode: string;
  article: string;
  name: string;
  dup_count: number;
  taken?: boolean;
  match?: string;
  match_article?: string;
  foreign?: boolean;
}

export type BarcodeGroup = "all" | "taken" | "add";

const TITLES: Record<BarcodeGroup, string> = {
  all: "Штрихкоды в файле",
  taken: "Штрихкоды уже заняты",
  add: "Штрихкоды добавятся",
};

const LIMIT = 300;

interface Props {
  group: BarcodeGroup | null;
  items: BarcodeItem[];
  onClose: () => void;
}

const BarcodeItemsSheet = ({ group, items, onClose }: Props) => {
  const [q, setQ] = useState("");
  const [onlyForeign, setOnlyForeign] = useState(false);

  const foreignCount = useMemo(() => items.filter((i) => i.foreign).length, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((it) => {
      if (onlyForeign && !it.foreign) return false;
      if (!s) return true;
      return (
        it.barcode.includes(s) ||
        it.article.toLowerCase().includes(s) ||
        it.name.toLowerCase().includes(s) ||
        (it.match || "").toLowerCase().includes(s)
      );
    });
  }, [items, q, onlyForeign]);

  return (
    <Sheet
      open={group !== null}
      onOpenChange={(o) => {
        if (!o) {
          setQ("");
          setOnlyForeign(false);
          onClose();
        }
      }}
    >
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-4 rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>
            {group ? TITLES[group] : ""}: {items.length}
          </SheetTitle>
        </SheetHeader>
        <div className="relative mt-3">
          <Icon
            name="Search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Штрихкод, артикул или наименование"
            className="pl-9 rounded-xl"
          />
        </div>
        {foreignCount > 0 && (
          <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={onlyForeign}
              onChange={(e) => setOnlyForeign(e.target.checked)}
            />
            Только занятые другим товаром: {foreignCount}
          </label>
        )}
        {(q.trim() || onlyForeign) && (
          <div className="text-xs text-muted-foreground mt-2">Найдено: {filtered.length}</div>
        )}
        <div className="flex-1 overflow-y-auto mt-3 space-y-2">
          {filtered.slice(0, LIMIT).map((it) => (
            <div
              key={it.barcode}
              className={`rounded-xl p-3 text-sm space-y-1 ${
                it.foreign ? "bg-destructive/15 border border-destructive/40" : "bg-secondary"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-medium text-primary">{it.barcode}</span>
                {group === "all" && (
                  <span className="text-xs text-muted-foreground">
                    {it.taken ? "уже занят" : "добавится"}
                  </span>
                )}
                {it.dup_count > 1 && (
                  <span className="text-xs rounded-md bg-primary/15 text-primary px-1.5 py-0.5">
                    у {it.dup_count} товаров в файле
                  </span>
                )}
              </div>
              <div className="text-foreground">
                <span className="text-muted-foreground">{it.article || "без артикула"} · </span>
                {it.name}
              </div>
              {it.taken !== false && it.match !== undefined && (
                <div
                  className={`text-xs flex gap-1 ${
                    it.foreign ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  <Icon name={it.foreign ? "TriangleAlert" : "Link"} size={12} className="mt-0.5 shrink-0" />
                  <span>
                    {it.foreign ? "Занят другим товаром: " : "Уже у карточки: "}
                    {it.match_article ? `${it.match_article} · ` : ""}
                    {it.match || "карточка не найдена"}
                  </span>
                </div>
              )}
            </div>
          ))}
          {filtered.length > LIMIT && (
            <div className="text-xs text-muted-foreground text-center py-2">
              Показаны первые {LIMIT} из {filtered.length}. Уточните поиск.
            </div>
          )}
          {filtered.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">Ничего не найдено</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BarcodeItemsSheet;
