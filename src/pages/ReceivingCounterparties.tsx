import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import CounterpartyDialog from "@/components/receiving/CounterpartyDialog";
import {
  loadCounterparties,
  loadCpMeta,
  type Counterparty,
} from "@/lib/counterparties";

/** Справочник контрагентов приёмки — для кого собирают партии. */
const ReceivingCounterparties = () => {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<{ can_see: boolean; can_edit: boolean } | null>(null);
  const [rows, setRows] = useState<Counterparty[]>([]);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState<Counterparty | "new" | null>(null);

  useEffect(() => {
    loadCpMeta()
      .then(setMeta)
      .catch(() => setMeta({ can_see: false, can_edit: false }));
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await loadCounterparties(q, archived);
      setRows(d.rows);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [q, archived]);

  useEffect(() => {
    if (!meta?.can_see) return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [meta, load]);

  const back = () => navigate("/admin/receipts");

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meta.can_see) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="Lock" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium mb-1">Контрагенты вам не открыты</p>
          <p className="text-sm text-muted-foreground mb-4">Обратитесь к владельцу</p>
          <Button onClick={back}>К приёмкам</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={back}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="flex-1 text-base font-semibold truncate">Контрагенты</h1>
          {meta.can_edit && (
            <Button size="sm" className="h-9" onClick={() => setOpen("new")}>
              <Icon name="Plus" size={16} className="mr-1" />
              Добавить
            </Button>
          )}
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название, ИНН, телефон, контакт"
            className="h-10"
          />
          <Button
            variant={archived ? "default" : "outline"}
            className="h-10 shrink-0 border-white/[0.1]"
            onClick={() => setArchived((v) => !v)}
          >
            <Icon name="Archive" size={16} className="sm:mr-1" />
            <span className="hidden sm:inline">Архив</span>
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-4 space-y-2">
        {archived && <p className="text-xs text-muted-foreground">Показан архив</p>}
        {busy && rows.length === 0 && (
          <div className="flex justify-center py-10">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {!busy && rows.length === 0 && (
          <div className="text-center py-10">
            <Icon name="Users" size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {q ? "Ничего не нашлось" : archived ? "Архив пуст" : "Контрагентов пока нет"}
            </p>
          </div>
        )}
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpen(r)}
            className="w-full text-left rounded-xl border border-white/[0.08] bg-card hover:bg-white/[0.04] px-4 py-3 transition-colors"
          >
            <div className="font-medium break-words">{r.name}</div>
            <div className="text-xs text-muted-foreground break-words">
              {[r.inn && `ИНН ${r.inn}`, r.phone, r.contact].filter(Boolean).join(" · ") ||
                "без реквизитов"}
            </div>
          </button>
        ))}
      </main>

      {open && (
        <CounterpartyDialog
          row={open === "new" ? null : open}
          canEdit={meta.can_edit}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
};

export default ReceivingCounterparties;
