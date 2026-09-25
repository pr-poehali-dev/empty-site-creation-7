import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import OutcomeChips from "./OutcomeChips";
import { KIND_SHORT, loadReceivings, type ReceivingRow } from "./dailyApi";

interface Props {
  /** Текущую приёмку в список прошлых не показываем. */
  excludeId?: number;
  backTo: string;
}

const PAGE = 5;

const dateRu = (v: string) =>
  new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "2-digit" });

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
            <button
              key={r.id}
              onClick={() =>
                navigate(
                  `/admin/receiving-archive/${r.id}?back=${encodeURIComponent(backTo)}`
                )
              }
              className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm flex items-center gap-2">
                  <span>{dateRu(r.work_date)}</span>
                  {!r.closed && (
                    <span className="text-[10px] rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
                      открыта
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {KIND_SHORT[r.kind] || r.kind} · {r.qty} шт
                </div>
              </div>
              <OutcomeChips counters={r.counters} />
              <Icon name="ChevronRight" size={15} className="text-muted-foreground shrink-0" />
            </button>
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
    </div>
  );
};

export default PastReceivings;
