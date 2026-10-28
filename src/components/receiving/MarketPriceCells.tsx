import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SITE_COLUMNS,
  STATUS_TEXT,
  TOTAL_COLUMNS,
  shortDate,
  sourceUrl,
  type PriceRow,
  type SiteKey,
  type TotalKey,
} from "@/lib/marketPrices";

interface SiteProps {
  site: SiteKey;
  row?: PriceRow;
  busy: boolean;
  canEdit: boolean;
  onFetch: () => void;
}

export const SiteCell = ({ site, row, busy, canEdit, onFetch }: SiteProps) => {
  const [ask, setAsk] = useState(false);
  const cur = SITE_COLUMNS.find((s) => s.key === site)?.cur;
  const price = row?.[site];
  const status = row?.[`${site}_status`] as string | null | undefined;
  const title = row?.[`${site}_title`] as string | null | undefined;
  const at = shortDate(row?.[`${site}_at`]);
  const src = sourceUrl(site, row);
  const openSource = () => {
    if (src) window.open(src.url, "_blank", "noopener,noreferrer");
  };

  if (busy) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Icon name="Loader2" size={13} className="animate-spin" />
        ищу...
      </span>
    );
  }

  if (!status) {
    if (!canEdit) return <span className="text-muted-foreground">—</span>;
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs border-violet-500/40 text-violet-200"
        onClick={onFetch}
      >
        <Icon name="Search" size={12} className="mr-1" />
        Получить цену
      </Button>
    );
  }

  const hasPrice = price != null && price !== "";
  return (
    <>
      <button
        type="button"
        disabled={!canEdit && !src}
        onClick={() => setAsk(true)}
        title={title || undefined}
        className="text-left rounded px-1 -mx-1 hover:bg-white/[0.06] disabled:hover:bg-transparent"
      >
        {hasPrice ? (
          <span className="tabular-nums text-foreground">
            {money(price)} {cur}
          </span>
        ) : (
          <span className={status === "not_found" ? "text-muted-foreground" : "text-amber-300"}>
            {STATUS_TEXT[status] || status}
          </span>
        )}
        {at && <span className="block text-[10px] text-muted-foreground">{at}</span>}
      </button>
      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{SITE_COLUMNS.find((s) => s.key === site)?.title}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {title ? `Сейчас: ${title}` : "Цена будет заново взята с сайта"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {src && (
            <Button
              variant="outline"
              className="h-11 w-full border-sky-500/40 text-sky-200"
              onClick={() => {
                openSource();
                setAsk(false);
              }}
            >
              <Icon name="ExternalLink" size={16} className="mr-1.5" />
              {src.exact ? "Открыть товар на сайте" : "Открыть поиск на сайте"}
            </Button>
          )}
          {src && !src.exact && hasPrice && (
            <p className="text-xs text-muted-foreground -mt-2">
              Точной ссылки ещё нет — появится после перепарсинга
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            {canEdit && (
              <AlertDialogAction onClick={onFetch}>
                <Icon name="RefreshCw" size={15} className="mr-1.5" />
                Перепарсить
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

interface TotalProps {
  field: TotalKey;
  row?: PriceRow;
  canEdit: boolean;
  onSave: (value: string) => void;
}

export const TotalCell = ({ field, row, canEdit, onSave }: TotalProps) => {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState("");
  const cur = TOTAL_COLUMNS.find((t) => t.key === field)?.cur;
  const value = row?.[field];
  const manual = Boolean(row?.[`${field}_manual`]);

  if (edit) {
    const done = () => {
      setEdit(false);
      if (val !== String(value ?? "")) onSave(val);
    };
    return (
      <Input
        autoFocus
        value={val}
        inputMode="decimal"
        onChange={(e) => setVal(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === "Enter") done();
          if (e.key === "Escape") setEdit(false);
        }}
        className="h-7 w-28 text-sm"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => {
        setVal(value == null ? "" : String(value));
        setEdit(true);
      }}
      title={canEdit ? "Нажмите, чтобы ввести вручную" : undefined}
      className="text-left rounded px-1 -mx-1 hover:bg-white/[0.06] disabled:hover:bg-transparent"
    >
      {value != null && value !== "" ? (
        <span className="tabular-nums font-medium text-emerald-200">
          {money(value)} {cur}
          {manual && <span className="ml-1 text-[10px] text-muted-foreground">вручную</span>}
        </span>
      ) : (
        <span className="text-muted-foreground">{canEdit ? "ввести" : "—"}</span>
      )}
    </button>
  );
};
