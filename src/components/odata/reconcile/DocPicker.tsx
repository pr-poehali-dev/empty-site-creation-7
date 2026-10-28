import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { reconApi } from "@/pages/odata/odataApi";
import { DocHead, Mode, docTitle, fmt } from "./types";

interface Props {
  base: string;
  mode: Mode;
  kind: "waybill" | "invoice";
  title: string;
  selectedKey?: string;
  onPick: (d: DocHead) => void;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const DocPicker = ({ base, mode, kind, title, selectedKey, onPick }: Props) => {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [docs, setDocs] = useState<DocHead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const d = await reconApi.list(base, { mode, kind, q, date_from: from, date_to: to });
      setDocs(d.docs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setDocs(null);
    load();
  }, [mode, kind]);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-3">
      <p className="font-medium text-sm">{title}</p>
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Номер документа"
          className="h-10"
        />
        <Button className="h-10 shrink-0" onClick={load} disabled={busy}>
          <Icon name={busy ? "Loader2" : "Search"} size={16} className={busy ? "animate-spin" : ""} />
        </Button>
      </div>
      {!q && (
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          <span className="text-muted-foreground">—</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {docs && docs.length === 0 && <p className="text-sm text-muted-foreground">Документов не найдено</p>}
      {docs && docs.length > 0 && (
        <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
          {docs.map((d) => (
            <button
              key={d.key}
              onClick={() => onPick(d)}
              className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                selectedKey === d.key ? "bg-primary/20 ring-1 ring-primary/50" : "bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium flex-1">{docTitle(d)}</span>
                <span className="text-sm tabular-nums">{fmt(d.amount)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate flex-1">{d.counterparty || "—"}</span>
                {!d.posted && <span className="text-amber-300">не проведён</span>}
                {kind === "waybill" && !d.invoice_key && <span>без счёта-основания</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocPicker;
