import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

export interface ReportItem {
  article: string;
  name: string;
  barcodes: string[];
  category?: string;
  match?: string;
  match_article?: string;
  in_catalog?: boolean;
}

export type ReportGroup = "new" | "exist" | "excluded";

const TITLES: Record<ReportGroup, string> = {
  new: "Новые товары",
  exist: "Уже есть в каталоге",
  excluded: "Отсеянные товары",
};

const LIMIT = 300;

interface Props {
  group: ReportGroup | null;
  items: ReportItem[];
  onClose: () => void;
}

const ReportItemsSheet = ({ group, items, onClose }: Props) => {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) =>
        it.article.toLowerCase().includes(s) ||
        it.name.toLowerCase().includes(s) ||
        it.barcodes.some((b) => b.includes(s)) ||
        (it.match || "").toLowerCase().includes(s),
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
            placeholder="Артикул, наименование или штрихкод"
            className="pl-9 rounded-xl"
          />
        </div>
        {q.trim() && (
          <div className="text-xs text-muted-foreground mt-2">Найдено: {filtered.length}</div>
        )}
        <div className="flex-1 overflow-y-auto mt-3 space-y-2">
          {filtered.slice(0, LIMIT).map((it, i) => (
            <div key={i} className="rounded-xl bg-secondary p-3 text-sm space-y-1">
              <div className="flex gap-2">
                <span className="font-medium text-primary shrink-0">{it.article || "без артикула"}</span>
                <span className="text-foreground">{it.name}</span>
              </div>
              <div className="text-xs text-muted-foreground break-all">
                {it.barcodes.length ? `ШК: ${it.barcodes.join(", ")}` : "Без штрихкода"}
              </div>
              {group === "exist" && it.match && (
                <div className="text-xs text-muted-foreground flex gap-1">
                  <Icon name="Link" size={12} className="mt-0.5 shrink-0" />
                  <span>
                    В каталоге: {it.match_article ? `${it.match_article} · ` : ""}
                    {it.match}
                  </span>
                </div>
              )}
              {group === "excluded" && (
                <div className="text-xs text-muted-foreground">
                  Категория: {it.category || "—"}
                  {it.in_catalog && <span className="text-primary"> · есть в каталоге</span>}
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

export default ReportItemsSheet;
