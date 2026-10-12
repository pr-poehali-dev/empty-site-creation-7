const INVOICE_URL = "https://functions.poehali.dev/da75537b-bd2c-4bb3-b3ee-5cd90f17c9a2";
const ODATA_URL = "https://functions.poehali.dev/74601b0f-9a91-4dbb-aef5-3cf2cadf93c8";

export type SearchBy = "article" | "barcode" | "name";

export const SEARCH_BY_TITLES: Record<SearchBy, string> = {
  article: "Артикул",
  barcode: "Штрихкод",
  name: "Наименование",
};

export interface InvoiceItem {
  num: string;
  article: string;
  barcode: string;
  name: string;
  qty: number | null;
  unit: string;
  price: number | null;
  total: number | null;
}

export interface ParsedInvoice {
  file_name: string;
  items: InvoiceItem[];
}

export interface Card1C {
  key: string;
  code: string;
  name: string;
  article: string;
  deleted: boolean;
}

export type MatchStatus = "found" | "multiple" | "missing" | "empty" | "error";

export interface MatchItem {
  value: string;
  status: MatchStatus;
  cards: Card1C[];
  error?: string | null;
}

export const parseInvoice = async (b64: string, fileName: string): Promise<ParsedInvoice> => {
  const r = await fetch(INVOICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "parse", file: b64, file_name: fileName }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Не удалось разобрать счёт");
  return d;
};

export const matchPortion = async (
  base: string,
  by: SearchBy,
  rows: InvoiceItem[],
): Promise<MatchItem[]> => {
  const r = await fetch(`${ODATA_URL}?action=nomen_match&base=${encodeURIComponent(base)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
    },
    body: JSON.stringify({
      action: "nomen_match",
      base,
      by,
      rows: rows.map((x) => ({ [by]: x[by] })),
    }),
  });
  const text = await r.text();
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error(`1С не ответила вовремя (код ${r.status})`);
  }
  if (!r.ok) throw new Error(d.error || `Ошибка запроса, код ${r.status}`);
  if (!d.result?.ok) throw new Error(d.result?.error || "Ошибка поиска в 1С");
  return d.result.items;
};
