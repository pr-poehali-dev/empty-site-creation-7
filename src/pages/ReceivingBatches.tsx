import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { STATUS_TITLE, loadBatchMeta, loadBatches, newBatch, type BatchCounts, type BatchRow } from "@/lib/batches";

const when = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const whText = (r: BatchRow) => (r.mixed ? "Смешанная" : r.warehouse || "склад не задан");

/** Раздел «Партии»: черновики всех сотрудников и собранные партии. */
const ReceivingBatches = () => {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<{ can_see: boolean; can_build: boolean; user_id: number } | null>(
    null
  );
  const [drafts, setDrafts] = useState<BatchRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [counts, setCounts] = useState<BatchCounts | null>(null);
  const [busy, setBusy] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadBatchMeta()
      .then((m) => {
        setMeta(m);
        if (!m.can_see) return;
        return loadBatches().then((d) => {
          setDrafts(d.drafts);
          setBatches(d.batches);
          setCounts(d.counts);
        });
      })
      .catch((e) => {
        toast({ title: (e as Error).message, variant: "destructive" });
        setMeta((m) => m || { can_see: false, can_build: false, user_id: 0 });
      })
      .finally(() => setBusy(false));
  }, []);

  const back = () => navigate("/admin/receiving-documents");
  const open = (id: number) => navigate(`/admin/receiving-batches/${id}`);

  const create = async () => {
    setCreating(true);
    try {
      const r = await newBatch();
      if (!r.created) toast({ title: "У вас уже есть черновик — открываю его" });
      open(r.id);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setCreating(false);
    }
  };

  if (!meta || busy) {
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
          <p className="font-medium mb-1">Партии вам не открыты</p>
          <p className="text-sm text-muted-foreground mb-4">Обратитесь к владельцу</p>
          <Button onClick={back}>К документам</Button>
        </div>
      </div>
    );
  }

  const row = (r: BatchRow, draft: boolean) => (
    <button
      key={r.id}
      onClick={() => open(r.id)}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors hover:bg-white/[0.04] ${
        draft && r.created_by_user === meta.user_id
          ? "border-violet-500/40 bg-violet-500/[0.06]"
          : "border-white/[0.08] bg-card"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium flex-1 min-w-0 truncate">
          {draft ? `Черновик · ${r.created_by_name || "сотрудник"}` : `Партия ${r.number || r.id}`}
        </span>
        {!draft && r.status !== "done" && (
          <span className="text-[11px] rounded-md px-1.5 py-0.5 bg-white/[0.08] text-muted-foreground shrink-0">
            {STATUS_TITLE[r.status] || r.status}
          </span>
        )}
        <span className="text-sm shrink-0">{r.qty} шт.</span>
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {whText(r)}
        {r.counterparty ? ` · ${r.counterparty}` : ""} · {draft ? "начат" : "изменена"}{" "}
        {when(draft ? r.created_at : r.updated_at)}
      </div>
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={back}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Партии</h1>
            {counts && (
              <p className="text-xs text-muted-foreground truncate">
                Собрано: {counts.done} · Черновиков: {counts.drafts}
              </p>
            )}
          </div>
          {meta.can_build && (
            <Button size="sm" className="h-9" disabled={creating} onClick={create}>
              <Icon name={creating ? "Loader2" : "Plus"} size={16} className={`mr-1 ${creating ? "animate-spin" : ""}`} />
              Новая партия
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-4 space-y-4">
        <section className="space-y-2">
          <h2 className="text-sm text-muted-foreground">
            Черновики{counts && counts.drafts > 0 ? ` · ${counts.drafts}` : ""}
          </h2>
          {drafts.length === 0 && <p className="text-sm text-muted-foreground">Черновиков нет</p>}
          {drafts.map((r) => row(r, true))}
        </section>
        <section className="space-y-2">
          <h2 className="text-sm text-muted-foreground">
            Собранные партии{counts ? ` · ${counts.done}` : ""}
          </h2>
          {batches.length === 0 && (
            <p className="text-sm text-muted-foreground">Собранных партий пока нет</p>
          )}
          {batches.map((r) => row(r, false))}
        </section>
      </main>
    </div>
  );
};

export default ReceivingBatches;
