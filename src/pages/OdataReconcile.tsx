import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { findBase } from "./odata/bases";
import { reconApi } from "./odata/odataApi";
import DocPicker from "@/components/odata/reconcile/DocPicker";
import ReconTable from "@/components/odata/reconcile/ReconTable";
import {
  DocHead,
  MODE_TEXT,
  Mode,
  ReconResult,
  Totals,
  docTitle,
  exportRecon,
  fmt,
} from "@/components/odata/reconcile/types";

const TOTAL_FIELDS: { key: keyof Totals; title: string }[] = [
  { key: "qty", title: "Количество" },
  { key: "amount", title: "Сумма" },
  { key: "vat", title: "НДС" },
  { key: "total", title: "Всего" },
];

const OdataReconcile = () => {
  const navigate = useNavigate();
  const { base = "trade-resurs" } = useParams();
  const baseInfo = findBase(base);
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");

  const [mode, setMode] = useState<Mode>("sale");
  const [waybill, setWaybill] = useState<DocHead | null>(null);
  const [needInvoice, setNeedInvoice] = useState(false);
  const [result, setResult] = useState<ReconResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = MODE_TEXT[mode];

  useEffect(() => {
    if (user.role !== "owner") navigate("/admin/dashboard");
  }, []);

  const reset = () => {
    setWaybill(null);
    setNeedInvoice(false);
    setResult(null);
    setError("");
  };

  const run = async (w: DocHead, invoiceKey?: string) => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const d = await reconApi.compare(base, { mode, waybill_key: w.key, invoice_key: invoiceKey });
      if (d.need_invoice) setNeedInvoice(true);
      else {
        setNeedInvoice(false);
        setResult(d);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const pickWaybill = (d: DocHead) => {
    setWaybill(d);
    setNeedInvoice(false);
    run(d);
  };

  const diffClass = (a: number, b: number) => (Math.abs(a - b) > 0.005 ? "text-amber-300 font-semibold" : "");

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate(`/admin/odata/${base}`)}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold leading-tight truncate">Сверка счёта с накладной</h1>
            <p className="text-xs text-muted-foreground">{baseInfo?.title || base}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.08] bg-card p-1">
          {(Object.keys(MODE_TEXT) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                reset();
              }}
              className={`h-10 rounded-lg text-sm transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/[0.04]"
              }`}
            >
              {MODE_TEXT[m].label} ↔ {MODE_TEXT[m].invoice.toLowerCase()}
            </button>
          ))}
        </div>

        {!result && (
          <DocPicker
            base={base}
            mode={mode}
            kind="waybill"
            title={`1. Выберите ${t.waybill.toLowerCase()}`}
            selectedKey={waybill?.key}
            onPick={pickWaybill}
          />
        )}

        {busy && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Icon name="Loader2" size={16} className="animate-spin" />
            Читаю документы из 1С...
          </p>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
        )}

        {needInvoice && waybill && !result && (
          <>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {t.waybill} {docTitle(waybill)} создана не на основании счёта. Выберите счёт вручную.
            </div>
            <DocPicker
              base={base}
              mode={mode}
              kind="invoice"
              title={`2. Выберите ${t.invoice.toLowerCase()}`}
              onPick={(inv) => run(waybill, inv.key)}
            />
          </>
        )}

        {result && (
          <>
            <div className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-3">
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                {([
                  [t.invoice, result.invoice],
                  [t.waybill, result.waybill],
                ] as const).map(([label, d]) => (
                  <div key={label} className="rounded-lg bg-white/[0.03] px-3 py-2">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-medium">{docTitle(d)}</div>
                    <div className="text-xs text-muted-foreground truncate">{d.counterparty || "—"}</div>
                  </div>
                ))}
              </div>
              {!result.linked && (
                <p className="text-xs text-muted-foreground">Счёт выбран вручную — накладная не связана с ним в 1С.</p>
              )}
              {!result.same_counterparty && (
                <p className="text-xs text-amber-300">Контрагенты в документах разные.</p>
              )}
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left font-normal">Итого</th>
                    <th className="text-right font-normal">Счёт</th>
                    <th className="text-right font-normal">Накладная</th>
                  </tr>
                </thead>
                <tbody>
                  {TOTAL_FIELDS.map((f) => {
                    const a = result.totals.invoice[f.key];
                    const b = result.totals.waybill[f.key];
                    return (
                      <tr key={f.key} className={diffClass(a, b)}>
                        <td className="py-0.5">{f.title}</td>
                        <td className="text-right">{fmt(a, f.key === "qty")}</td>
                        <td className="text-right">{fmt(b, f.key === "qty")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  result.rows.length === result.counts.ok
                    ? "bg-emerald-500/10 text-emerald-200"
                    : "bg-amber-500/10 text-amber-200"
                }`}
              >
                {result.rows.length === result.counts.ok
                  ? "Документы полностью совпадают"
                  : [
                      result.counts.diff && `расхождений: ${result.counts.diff}`,
                      result.counts.only_invoice && `только в счёте: ${result.counts.only_invoice}`,
                      result.counts.only_waybill && `только в накладной: ${result.counts.only_waybill}`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-10" onClick={() => exportRecon(result, mode)}>
                  <Icon name="Download" size={16} className="mr-1.5" />
                  Скачать в Excel
                </Button>
                <Button variant="outline" className="flex-1 h-10" onClick={reset}>
                  <Icon name="RotateCcw" size={16} className="mr-1.5" />
                  Другая накладная
                </Button>
              </div>
            </div>
            <ReconTable result={result} invoiceTitle="Счёт" waybillTitle="Накладная" />
          </>
        )}
      </main>
    </div>
  );
};

export default OdataReconcile;
