import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { loadCounterparties, type Counterparty } from "@/lib/counterparties";

interface Props {
  onPick: (c: Counterparty | null) => void;
  onClose: () => void;
}

/** Выбор контрагента партии из справочника, с поиском. */
const CounterpartyPicker = ({ onPick, onClose }: Props) => {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Counterparty[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      loadCounterparties(q)
        .then((d) => alive && (setRows(d.rows), setError("")))
        .catch((e) => alive && setError((e as Error).message))
        .finally(() => alive && setBusy(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-card border-t sm:border border-white/[0.1] sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col">
        <div className="border-b border-white/[0.08] px-4 py-3 flex items-center gap-2">
          <p className="flex-1 font-semibold">Контрагент</p>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <Icon name="X" size={18} />
          </Button>
        </div>
        <div className="px-4 pt-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название, ИНН, телефон"
            className="h-11"
          />
        </div>
        <div className="px-4 py-3 space-y-1.5 overflow-y-auto">
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {busy && rows.length === 0 && !error && (
            <Icon name="Loader2" size={20} className="animate-spin text-muted-foreground mx-auto" />
          )}
          {!busy && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Ничего не нашлось</p>
          )}
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => onPick(r)}
              className="w-full text-left rounded-lg border border-white/[0.08] hover:bg-white/[0.05] px-3 py-2"
            >
              <div className="text-sm break-words">{r.name}</div>
              {(r.inn || r.phone) && (
                <div className="text-xs text-muted-foreground">
                  {[r.inn && `ИНН ${r.inn}`, r.phone].filter(Boolean).join(" · ")}
                </div>
              )}
            </button>
          ))}
          <Button variant="ghost" className="w-full h-10 mt-1" onClick={() => onPick(null)}>
            Без контрагента
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CounterpartyPicker;
