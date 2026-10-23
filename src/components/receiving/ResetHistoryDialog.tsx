import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { permHeaders } from "@/hooks/useReceivingPerms";
import { RECEIVING_CATALOG_URL } from "@/lib/receivingCatalog";

interface Preview {
  item: {
    tech_name: string | null;
    serial_number: string | null;
    supplier_barcode: string | null;
    check_result: string | null;
    warehouse: string | null;
    checked_by_name: string | null;
    checked_at: string | null;
    wipe_result: string | null;
  };
  counts: { moves: number; fixes: number; events: number };
  held: { status: string; number: string | null; by: string | null } | null;
}

interface Props {
  itemId: number;
  onClose: () => void;
  onDone: () => void;
}

const post = (body: object) =>
  fetch(RECEIVING_CATALOG_URL, {
    method: "POST",
    headers: permHeaders(),
    body: JSON.stringify(body),
  }).then(async (r) => ({ ok: r.ok, data: await r.json() }));

const ResetHistoryDialog = ({ itemId, onClose, onDone }: Props) => {
  const [p, setP] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  useEffect(() => {
    post({ action: "reset_preview", id: itemId }).then(({ ok, data }) => {
      if (ok) setP(data);
      else setError(data.error || "Не удалось загрузить товар");
    });
  }, [itemId]);

  const run = async () => {
    setBusy(true);
    const { ok, data } = await post({ action: "reset_item", id: itemId });
    setBusy(false);
    if (!ok) {
      setError(data.error || "Не удалось сбросить");
      return;
    }
    onDone();
  };

  const blocked = p?.held && p.held.status !== "draft";
  const it = p?.item;
  const lines = it
    ? [
        it.check_result || it.checked_at
          ? `Проверка${it.checked_by_name ? ` (${it.checked_by_name})` : ""}, дефекты, упаковка`
          : null,
        it.wipe_result ? "Результат протирки" : null,
        it.warehouse ? `Склад «${it.warehouse}» — товар станет не принятым` : null,
        p!.counts.moves ? `Перемещения между складами: ${p!.counts.moves}` : null,
        p!.counts.fixes ? `Правки результата: ${p!.counts.fixes}` : null,
        p!.counts.events ? `Следы в работе приёмок: ${p!.counts.events}` : null,
        p!.held?.status === "draft"
          ? `Уберётся из черновика партии${p!.held.by ? ` у ${p!.held.by}` : ""}`
          : null,
      ].filter(Boolean)
    : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Сбросить историю товара</DialogTitle>
          <DialogDescription>
            Товар останется в каталоге как пришёл из файла поставщика. Вернуть стёртое нельзя.
          </DialogDescription>
        </DialogHeader>

        {!p && !error && <p className="text-sm text-muted-foreground">Загружаю...</p>}

        {it && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-white/[0.08] p-3 space-y-0.5">
              <div className="font-medium break-words">{it.tech_name || "Без наименования"}</div>
              <div className="text-xs text-muted-foreground">
                Серийный номер: {it.serial_number || "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                Штрихкод поставщика: {it.supplier_barcode || "—"}
              </div>
            </div>

            {blocked ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
                Товар в партии {p!.held!.number} — сначала уберите его из партии
              </div>
            ) : lines.length === 0 ? (
              <p className="text-muted-foreground">С этим товаром ещё ничего не делали — стирать нечего.</p>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Сотрётся:</p>
                <ul className="space-y-1">
                  {lines.map((l) => (
                    <li key={l as string} className="flex gap-2">
                      <Icon name="X" size={14} className="text-red-400 mt-0.5 shrink-0" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Данные поставщика и заводские штрихкоды останутся.
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col gap-2 pt-1">
          {p && !blocked && lines.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={sure}
                  onChange={(e) => setSure(e.target.checked)}
                  className="h-4 w-4"
                />
                Понимаю, что история удалится навсегда
              </label>
              <Button variant="destructive" disabled={!sure || busy} onClick={run}>
                {busy ? "Сбрасываю..." : "Сбросить историю"}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResetHistoryDialog;
