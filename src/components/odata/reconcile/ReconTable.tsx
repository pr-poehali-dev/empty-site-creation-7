import { useState } from "react";
import Icon from "@/components/ui/icon";
import { FIELDS, ReconResult, ReconRow, RowStatus, STATUS_TEXT, fmt } from "./types";

const TONE: Record<RowStatus, string> = {
  ok: "border-emerald-500/25 bg-emerald-500/[0.06]",
  diff: "border-amber-500/30 bg-amber-500/[0.08]",
  only_invoice: "border-red-500/30 bg-red-500/[0.08]",
  only_waybill: "border-red-500/30 bg-red-500/[0.08]",
};

const BADGE: Record<RowStatus, string> = {
  ok: "text-emerald-300",
  diff: "text-amber-300",
  only_invoice: "text-red-300",
  only_waybill: "text-red-300",
};

const Row = ({ r, invoiceTitle, waybillTitle }: { r: ReconRow; invoiceTitle: string; waybillTitle: string }) => (
  <div className={`rounded-lg border p-3 space-y-2 ${TONE[r.status]}`}>
    <div className="flex items-start gap-2">
      <span className="text-sm font-medium flex-1 break-words">{r.name}</span>
      <span className={`text-xs shrink-0 ${BADGE[r.status]}`}>{STATUS_TEXT[r.status]}</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-normal pr-2"></th>
            {FIELDS.map((f) => (
              <th key={f.key} className="text-right font-normal px-1.5">
                {f.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {([
            [invoiceTitle, r.invoice],
            [waybillTitle, r.waybill],
          ] as const).map(([label, g]) => (
            <tr key={label}>
              <td className="pr-2 text-muted-foreground whitespace-nowrap">{label}</td>
              {FIELDS.map((f) => (
                <td
                  key={f.key}
                  className={`text-right px-1.5 whitespace-nowrap ${r.diff.includes(f.key) ? "text-amber-200 font-semibold" : ""}`}
                >
                  {g ? fmt(g[f.key], f.key === "qty") : "—"}
                </td>
              ))}
            </tr>
          ))}
          {r.status === "diff" && (
            <tr className="text-amber-300">
              <td className="pr-2 whitespace-nowrap">Разница</td>
              {FIELDS.map((f) => {
                const d = (r.waybill?.[f.key] ?? 0) - (r.invoice?.[f.key] ?? 0);
                return (
                  <td key={f.key} className="text-right px-1.5 whitespace-nowrap">
                    {r.diff.includes(f.key) ? `${d > 0 ? "+" : ""}${fmt(d, f.key === "qty")}` : ""}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

interface Props {
  result: ReconResult;
  invoiceTitle: string;
  waybillTitle: string;
}

const ReconTable = ({ result, invoiceTitle, waybillTitle }: Props) => {
  const [onlyBad, setOnlyBad] = useState(true);
  const bad = result.rows.length - result.counts.ok;
  const rows = onlyBad && bad > 0 ? result.rows.filter((r) => r.status !== "ok") : result.rows;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground flex-1">
          Позиций: {result.rows.length}, с расхождениями: {bad}
        </p>
        {bad > 0 && result.counts.ok > 0 && (
          <button onClick={() => setOnlyBad((v) => !v)} className="text-xs text-primary flex items-center gap-1">
            <Icon name={onlyBad ? "Eye" : "EyeOff"} size={14} />
            {onlyBad ? `Показать совпавшие (${result.counts.ok})` : "Только расхождения"}
          </button>
        )}
      </div>
      {rows.map((r) => (
        <Row key={r.key} r={r} invoiceTitle={invoiceTitle} waybillTitle={waybillTitle} />
      ))}
    </div>
  );
};

export default ReconTable;
