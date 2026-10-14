import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { loadBatchLog, type BatchSummary, type LogRow } from "@/lib/batches";

export const Sheet = ({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) => (
  <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75">
    <div className="w-full sm:max-w-md bg-card border-t sm:border border-white/[0.1] rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-white/[0.08] px-4 py-3 flex items-center gap-2">
        <p className="flex-1 font-semibold">{title}</p>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} disabled={busy}>
          <Icon name="X" size={18} />
        </Button>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  </div>
);

export const FinishDialog = ({
  s,
  counterparty,
  busy,
  onConfirm,
  onClose,
}: {
  s: BatchSummary;
  counterparty: string | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <Sheet title="Завершить партию?" onClose={onClose} busy={busy}>
    <div className="rounded-xl bg-white/[0.04] divide-y divide-white/[0.06] text-sm">
      {[
        ["Всего", `${s.total} шт.`],
        ["Подтверждено по наклейке", `${s.exact} шт.`],
        ["Подставлено", `${s.auto} шт.`],
        ["Склад", s.mixed ? `Смешанная (${s.warehouses.join(", ")})` : s.warehouses[0] || "—"],
        ["Контрагент", counterparty || "не выбран"],
      ].map(([k, v]) => (
        <div key={k} className="flex gap-3 px-3 py-2">
          <span className="flex-1 text-muted-foreground">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
    </div>
    {s.auto > 0 && (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-sm text-amber-200 flex gap-2">
        <Icon name="TriangleAlert" size={16} className="shrink-0 mt-0.5" />
        <span>
          Подставлено {s.auto} шт. — их наклейки не пикали. Можно завершить так, подставленные
          меняются и в собранной партии.
        </span>
      </div>
    )}
    <p className="text-xs text-muted-foreground">
      Партия получит номер, а её товар можно будет двигать только всей партией или через
      «Забрать».
    </p>
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1 h-11 border-white/[0.1]" disabled={busy} onClick={onClose}>
        Отмена
      </Button>
      <Button className="flex-1 h-11" disabled={busy} onClick={onConfirm}>
        {busy ? <Icon name="Loader2" size={16} className="animate-spin" /> : "Завершить"}
      </Button>
    </div>
  </Sheet>
);

export const ConfirmDisband = ({
  number,
  qty,
  busy,
  onConfirm,
  onClose,
}: {
  number: string;
  qty: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <Sheet title="Разобрать партию?" onClose={onClose} busy={busy}>
    <p className="text-sm text-muted-foreground">
      Весь товар партии {number} ({qty} шт.) освободится и снова станет свободным на своих
      складах. Номер останется в истории со статусом «разобрана».
    </p>
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1 h-11 border-white/[0.1]" disabled={busy} onClick={onClose}>
        Отмена
      </Button>
      <Button className="flex-1 h-11 bg-rose-600 hover:bg-rose-500 text-white" disabled={busy} onClick={onConfirm}>
        Разобрать
      </Button>
    </div>
  </Sheet>
);

const when = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const detailText = (r: LogRow) => {
  const d = r.details || {};
  if (r.action === "finish") return `№ ${d.number}`;
  if (r.action === "move") return `${d.from} → ${d.to}`;
  if (r.action === "take") return d.dest === "move" ? `перемещена на «${d.to}»` : "в черновик";
  if (r.action === "add") {
    if (d.from_batch) return "забрана из другой партии";
    return d.kind === "auto" ? "подставлена" : "по наклейке";
  }
  if (r.action === "disband" || r.action === "delete") return `освобождено ${d.freed ?? 0} шт.`;
  return "";
};

export const LogDialog = ({ batchId, onClose }: { batchId: number; onClose: () => void }) => {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadBatchLog(batchId)
      .then((r) => setRows(r.rows))
      .catch((e) => setError((e as Error).message));
  }, [batchId]);

  return (
    <Sheet title="Журнал партии" onClose={onClose}>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!rows && !error && (
        <Icon name="Loader2" size={22} className="animate-spin text-muted-foreground mx-auto" />
      )}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">Записей нет</p>}
      <div className="space-y-1.5">
        {rows?.map((r) => (
          <div key={r.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="flex gap-2 text-sm">
              <span className="flex-1">{r.title}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{when(r.at)}</span>
            </div>
            {(r.tech_name || detailText(r)) && (
              <div className="text-xs text-muted-foreground break-words">
                {[r.tech_name, r.supplier_barcode, detailText(r)].filter(Boolean).join(" · ")}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">{r.by_name}</div>
          </div>
        ))}
      </div>
    </Sheet>
  );
};
