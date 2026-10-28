import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

export interface BarcodeItem {
  barcode: string;
  article: string;
  name: string;
  dup_count: number;
  dup_articles?: string[];
  taken?: boolean;
  no_product?: boolean;
  match?: string;
  match_article?: string;
  foreign?: boolean;
}

export type BarcodeGroup = "all" | "own" | "add" | "foreign" | "dups";

export const BARCODE_TITLES: Record<BarcodeGroup, string> = {
  all: "Штрихкоды в файле",
  own: "Уже у этого товара",
  add: "Добавятся",
  foreign: "Заняты другим товаром",
  dups: "Повторы в файле",
};

const LIMIT = 300;

interface Props {
  group: BarcodeGroup | null;
  items: BarcodeItem[];
  onClose: () => void;
}

const BarcodeItemsSheet = ({ group, items, onClose }: Props) => {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) =>
        it.barcode.includes(s) ||
        it.article.toLowerCase().includes(s) ||
        it.name.toLowerCase().includes(s) ||
        (it.match || "").toLowerCase().includes(s) ||
        (it.match_article || "").toLowerCase().includes(s),
    );
  }, [items, q]);

  return (
    <Sheet
      open={group !== null}
      onOpenChange={(o) => {
        if (!o) {
          setQ("");
          onClose();
        }
      }}
    >
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-4 rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>
            {group ? BARCODE_TITLES[group] : ""}: {items.length}
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
        {q.trim() && (
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
                {(group === "all" || group === "dups") && (
                  <span className="text-xs text-muted-foreground">
                    {it.foreign ? "занят другим товаром" : it.taken ? "уже у этого товара" : "добавится"}
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
              {it.dup_count > 1 && (it.dup_articles?.length ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground">
                  Также в файле у: {(it.dup_articles || []).join(", ")}
                </div>
              )}
              {it.no_product && (
                <div className="text-xs text-amber-500">Товара нет в каталоге — штрихкод не запишется</div>
              )}
              {it.taken && (
                <div
                  className={`text-xs flex gap-1 ${
                    it.foreign ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  <Icon name={it.foreign ? "TriangleAlert" : "Link"} size={12} className="mt-0.5 shrink-0" />
                  <span>
                    {it.foreign ? "Занят товаром: " : "Уже у карточки: "}
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
