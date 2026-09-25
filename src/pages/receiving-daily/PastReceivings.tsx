import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import DeleteDialog from "./DeleteDialog";
import ReceivingRowItem from "./ReceivingRowItem";
import { deleteReceiving, loadReceivings, type ReceivingRow } from "./dailyApi";

interface Props {
  /** Текущую приёмку в список прошлых не показываем. */
  excludeId?: number;
  backTo: string;
}

const PAGE = 5;

/** Прошлые приёмки мастера. Фильтры бьют по всей базе, а не по показанным пяти. */
const PastReceivings = ({ excludeId, backTo }: Props) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReceivingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<ReceivingRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const first = useRef(true);

  const fetchRows = useCallback(
    async (limit: number) => {
      setBusy(true);
      try {
        const d = await loadReceivings({
          mine: true,
          excludeId,
          dateFrom: from || undefined,
          dateTo: to || undefined,
          q: q || undefined,
          limit,
        });
        setRows(d.rows);
        setTotal(d.total);
      } catch {
        setRows([]);
        setTotal(0);
      } finally {
        setBusy(false);
      }
    },
    [excludeId, from, to, q]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      fetchRows(PAGE);
      return;
    }
    setShown(PAGE);
    const t = setTimeout(() => fetchRows(PAGE), 300);
    return () => clearTimeout(t);
  }, [from, to, q, fetchRows]);

  const more = () => {
    const next = shown + PAGE;
    setShown(next);
    fetchRows(next);
  };

  const reset = () => {
    setFrom("");
    setTo("");
    setQ("");
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteReceiving(toDelete.id);
      toast({ title: "Приёмка удалена" });
      setToDelete(null);
      fetchRows(shown);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = Boolean(from || to || q);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <Icon name="History" size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium flex-1">Мои прошлые приёмки</span>
        {busy ? (
          <Icon name="Loader2" size={14} className="animate-spin text-muted-foreground" />
        ) : (
          <span className="text-xs text-muted-foreground">{total}</span>
        )}
      </div>

      <div className="px-4 py-3 space-y-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 text-xs"
            aria-label="Дата от"
          />
          <span className="text-xs text-muted-foreground shrink-0">—</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 text-xs"
            aria-label="Дата до"
          />
        </div>
        <div className="relative">
          <Icon
            name="Search"
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Товар: модель, наименование, штрихкод"
            className="pl-9 h-9 text-xs"
          />
        </div>
        {filtered && (
          <button
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Сбросить фильтр
          </button>
        )}
      </div>

      <div className="divide-y divide-white/[0.06]">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            {filtered ? "По фильтру ничего нет" : "Прошлых приёмок пока нет"}
          </p>
        ) : (
          rows.map((r) => (
            <ReceivingRowItem
              key={r.id}
              row={r}
              deleting={deleting}
              onOpen={() =>
                navigate(
                  `/admin/receiving-archive/${r.id}?back=${encodeURIComponent(backTo)}`
                )
              }
              onDelete={() => setToDelete(r)}
            />
          ))
        )}
      </div>

      {rows.length < total && (
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <Button variant="ghost" size="sm" className="w-full h-8" disabled={busy} onClick={more}>
            Показать ещё
          </Button>
        </div>
      )}

      {toDelete && (
        <DeleteDialog
          workDate={toDelete.work_date}
          kind={toDelete.kind}
          busy={deleting}
          onConfirm={remove}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
};

export default PastReceivings;