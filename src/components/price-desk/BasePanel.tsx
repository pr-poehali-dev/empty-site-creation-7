import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { money } from "@/lib/receivingCatalog";
import {
  deskBasePreview,
  deskFillBase,
  deskWriteBase,
  type BasePreview,
  type DeskItem,
  type DeskSet,
} from "@/lib/priceDesk";

interface Props {
  set: DeskSet;
  items: DeskItem[];
  onApply: (d: { set: DeskSet; items: DeskItem[] }) => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

const BasePanel = ({ set, items, onApply, onNotice, onError }: Props) => {
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<BasePreview | null>(null);
  const filled = items.filter((i) => !i.is_new && i.new_base != null).length;
  const noRate = !set.rate_by_per_100_rub;

  const fill = async (source: "avg_by" | "avg_ru") => {
    setBusy(source);
    try {
      const d = await deskFillBase(set.id, source);
      onApply(d);
      onNotice(
        d.filled
          ? `Подставлено ${d.filled} цен из ${source === "avg_by" ? "средней РБ" : "средней РФ по курсу"}`
          : "Нечего подставлять: у пустых строк нет средней цены",
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  const openPreview = async () => {
    setBusy("preview");
    try {
      setPreview(await deskBasePreview(set.id));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  const write = async () => {
    setPreview(null);
    setBusy("write");
    try {
      const d = await deskWriteBase(set.id);
      onApply(d);
      onNotice(`Базовая цена записана в каталог: ${d.written}. Метка «цена с парсинга» поставлена.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Новая Базовая:</span>
      <Button variant="outline" size="sm" className="h-8" disabled={!!busy} onClick={() => fill("avg_by")}>
        <Icon name={busy === "avg_by" ? "Loader2" : "ArrowDownToLine"} size={14} className={`mr-1.5 ${busy === "avg_by" ? "animate-spin" : ""}`} />
        из средней РБ
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={!!busy || noRate}
        title={noRate ? "Сначала введите курс" : "Средняя РФ × курс / 100, только в пустые ячейки"}
        onClick={() => fill("avg_ru")}
      >
        <Icon name={busy === "avg_ru" ? "Loader2" : "ArrowDownToLine"} size={14} className={`mr-1.5 ${busy === "avg_ru" ? "animate-spin" : ""}`} />
        из средней РФ
      </Button>
      <Button
        size="sm"
        className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
        disabled={!!busy || !filled}
        onClick={openPreview}
      >
        <Icon name={busy === "write" || busy === "preview" ? "Loader2" : "Save"} size={14} className={`mr-1.5 ${busy === "write" || busy === "preview" ? "animate-spin" : ""}`} />
        Записать Базовую цену{filled ? ` (${filled})` : ""}
      </Button>

      <AlertDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Записать Базовую цену в каталог?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Всего: {preview?.total}. Заменится: {preview?.replace}. Впервые: {preview?.first}.
                </p>
                <p>Записанные цены получат метку «цена с парсинга» — заменить их можно только вручную, парсингом или галочкой в загрузке счетов.</p>
                {preview && preview.big.length > 0 && (
                  <div>
                    <p className="text-amber-300">Разница больше 30% — {preview.big.length}:</p>
                    <div className="mt-1 max-h-48 overflow-auto rounded border border-white/10">
                      {preview.big.map((b, i) => (
                        <div key={i} className="flex gap-2 px-2 py-1 text-xs border-b border-white/5">
                          <span className="flex-1 min-w-0 truncate">{b.name}</span>
                          <span className="tabular-nums whitespace-nowrap">
                            {money(b.old)} → {money(b.new)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={write}>Записать</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BasePanel;
