import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import DeleteDialog from "./receiving-daily/DeleteDialog";
import ReceivingRowItem from "./receiving-daily/ReceivingRowItem";
import {
  KIND_SHORT,
  deleteReceiving,
  loadReceivings,
  type ReceivingRow,
} from "./receiving-daily/dailyApi";

const PAGE = 10;
const BACK = "/admin/receiving-list";

const KIND_FILTERS = [
  { key: "", label: "Все виды" },
  { key: "kind_plain", label: KIND_SHORT.kind_plain },
  { key: "kind_check", label: KIND_SHORT.kind_check },
  { key: "kind_repair", label: KIND_SHORT.kind_repair },
];

/** Список приёмок. Свои видит каждый мастер, чужие — по праву «видит списки всех». */
const ReceivingList = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReceivingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [seeAll, setSeeAll] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [mine, setMine] = useState(false);
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState<ReceivingRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const first = useRef(true);

  const fetchRows = useCallback(
    async (limit: number) => {
      setBusy(true);
      try {
        const d = await loadReceivings({
          mine,
          kind: kind || undefined,
          dateFrom: from || undefined,
          dateTo: to || undefined,
          q: q || undefined,
          limit,
        });
        setRows(d.rows);
        setTotal(d.total);
        setSeeAll(Boolean(d.see_all));
        setError("");
      } catch (e) {
        setError((e as Error).message);
        setRows([]);
        setTotal(0);
      } finally {
        setBusy(false);
      }
    },
    [mine, kind, from, to, q]
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
  }, [mine, kind, from, to, q, fetchRows]);

  const more = () => {
    const next = shown + PAGE;
    setShown(next);
    fetchRows(next);
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

  const filtered = Boolean(from || to || q || kind || mine);

  const reset = () => {
    setFrom("");
    setTo("");
    setQ("");
    setKind("");
    setMine(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => navigate("/admin/receipts")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">Список приёмок</h1>
            <p className="text-xs text-muted-foreground truncate">
              {busy ? "Загружаю..." : `Найдено: ${total}`}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1 space-y-3">
        <div className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-2">
          {seeAll && (
            <div className="flex items-center gap-2">
              <Button
                variant={mine ? "ghost" : "secondary"}
                size="sm"
                className="h-8 flex-1"
                onClick={() => setMine(false)}
              >
                Все сотрудники
              </Button>
              <Button
                variant={mine ? "secondary" : "ghost"}
                size="sm"
                className="h-8 flex-1"
                onClick={() => setMine(true)}
              >
                Только мои
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            {KIND_FILTERS.map((k) => (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                  kind === k.key
                    ? "bg-white/[0.1] text-foreground"
                    : "text-muted-foreground hover:bg-white/[0.04]"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

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

        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
          <div className="divide-y divide-white/[0.06]">
            {rows.length === 0 && !busy ? (
              <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                {filtered ? "По фильтру ничего нет" : "Приёмок пока нет"}
              </p>
            ) : (
              rows.map((r) => (
                <ReceivingRowItem
                  key={r.id}
                  row={r}
                  full
                  deleting={deleting}
                  onOpen={() =>
                    navigate(
                      `/admin/receiving-archive/${r.id}?back=${encodeURIComponent(BACK)}`
                    )
                  }
                  onDelete={() => setToDelete(r)}
                />
              ))
            )}
          </div>

          {rows.length < total && (
            <div className="px-4 py-3 border-t border-white/[0.06]">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8"
                disabled={busy}
                onClick={more}
              >
                Показать ещё
              </Button>
            </div>
          )}
        </div>
      </main>

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

export default ReceivingList;