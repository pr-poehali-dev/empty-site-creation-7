import * as XLSX from "xlsx";

export type Mode = "sale" | "receipt";

export interface DocHead {
  key: string;
  number: string;
  date: string;
  posted: boolean;
  counterparty: string;
  amount: number;
  invoice_key?: string | null;
}

export interface Group {
  line: number;
  qty: number;
  price: number;
  amount: number;
  vat: number;
  total: number;
}

export type RowStatus = "ok" | "diff" | "only_invoice" | "only_waybill";
export type Field = "qty" | "price" | "amount" | "vat" | "total";

export interface ReconRow {
  key: string;
  name: string;
  invoice: Group | null;
  waybill: Group | null;
  status: RowStatus;
  diff: Field[];
}

export interface ReconResult {
  invoice: DocHead;
  waybill: DocHead;
  linked: boolean;
  same_counterparty: boolean;
  rows: ReconRow[];
  totals: { invoice: Totals; waybill: Totals };
  counts: Record<RowStatus, number>;
}

export interface Totals {
  qty: number;
  amount: number;
  vat: number;
  total: number;
}

export const MODE_TEXT: Record<Mode, { waybill: string; invoice: string; label: string }> = {
  sale: { waybill: "Реализация", invoice: "Счёт покупателю", label: "Реализация" },
  receipt: { waybill: "Поступление", invoice: "Счёт поставщика", label: "Поступление" },
};

export const FIELDS: { key: Field; title: string }[] = [
  { key: "qty", title: "Кол-во" },
  { key: "price", title: "Цена" },
  { key: "amount", title: "Сумма" },
  { key: "vat", title: "НДС" },
  { key: "total", title: "Всего" },
];

export const STATUS_TEXT: Record<RowStatus, string> = {
  ok: "Совпадает",
  diff: "Расхождение",
  only_invoice: "Только в счёте",
  only_waybill: "Только в накладной",
};

export const fmt = (n: number | undefined | null, qty = false) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("ru-RU", {
        minimumFractionDigits: qty ? 0 : 2,
        maximumFractionDigits: qty ? 3 : 2,
      });

export const docDate = (d: string) => (d ? new Date(d).toLocaleDateString("ru-RU") : "");

export const docTitle = (d: DocHead) => `№ ${d.number} от ${docDate(d.date)}`;

export const exportRecon = (r: ReconResult, mode: Mode) => {
  const t = MODE_TEXT[mode];
  const head = ["Стр. счёта", "Стр. накл.", "Товар", "Статус"];
  FIELDS.forEach((f) => head.push(`${f.title} (счёт)`, `${f.title} (накл.)`, `${f.title} разница`));
  const rows: (string | number | null)[][] = [
    [`${t.invoice} ${docTitle(r.invoice)}`, r.invoice.counterparty],
    [`${t.waybill} ${docTitle(r.waybill)}`, r.waybill.counterparty],
    [],
    head,
  ];
  r.rows.forEach((x) => {
    const line: (string | number | null)[] = [
      x.invoice?.line ?? null,
      x.waybill?.line ?? null,
      x.name,
      STATUS_TEXT[x.status],
    ];
    FIELDS.forEach((f) => {
      const a = x.invoice?.[f.key] ?? null;
      const b = x.waybill?.[f.key] ?? null;
      line.push(a, b, a != null && b != null ? Math.round((b - a) * 1000) / 1000 : null);
    });
    rows.push(line);
  });
  rows.push([]);
  rows.push(["", "", "Итого счёт", "", r.totals.invoice.qty, "", "", "", "", "", r.totals.invoice.amount, "", "", r.totals.invoice.vat, "", "", r.totals.invoice.total]);
  rows.push(["", "", "Итого накладная", "", r.totals.waybill.qty, "", "", "", "", "", r.totals.waybill.amount, "", "", r.totals.waybill.vat, "", "", r.totals.waybill.total]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 10 }, { wch: 10 }, { wch: 50 }, { wch: 18 }, ...Array(15).fill({ wch: 12 })];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Сверка");
  XLSX.writeFile(wb, `Сверка ${t.waybill} ${r.waybill.number}.xlsx`);
};
