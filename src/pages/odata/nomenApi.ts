const INVOICE_URL = "https://functions.poehali.dev/da75537b-bd2c-4bb3-b3ee-5cd90f17c9a2";
const ODATA_URL = "https://functions.poehali.dev/74601b0f-9a91-4dbb-aef5-3cf2cadf93c8";

export type SearchBy = "article" | "barcode" | "name";
export type SearchMode = "single" | "all";

export const SEARCH_BY_TITLES: Record<SearchBy, string> = {
  article: "Артикул",
  barcode: "Штрихкод",
  name: "Наименование",
};

export const SEARCH_BY_SHORT: Record<SearchBy, string> = {
  article: "А",
  barcode: "Ш",
  name: "Н",
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
  matched?: SearchBy[];
  full?: boolean;
}

export type MatchStatus = "found" | "multiple" | "partial" | "missing" | "empty" | "error";
export type BarcodeState = "ok" | "none" | "other" | "taken" | "no_invoice" | "error";

export interface BarcodeCheck {
  state: BarcodeState;
  have?: string[];
  owner?: { code: string; name: string } | null;
  error?: string;
}

export interface MatchItem {
  value: string;
  status: MatchStatus;
  cards: Card1C[];
  hits?: Partial<Record<SearchBy, boolean | null>>;
  error?: string | null;
  card_key?: string;
  bc?: BarcodeCheck;
}

export interface MatchOptions {
  mode: SearchMode;
  by: SearchBy;
  exact: boolean;
  checkBarcodes: boolean;
}

export interface BarcodeWriteResult {
  key: string;
  barcode: string;
  state: "added" | "exists" | "taken" | "error";
  owner?: { code: string; name: string };
  error?: string;
}

const odataPost = async (action: string, base: string, payload: object) => {
  const r = await fetch(`${ODATA_URL}?action=${action}&base=${encodeURIComponent(base)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
    },
    body: JSON.stringify({ action, base, ...payload }),
  });
  const text = await r.text();
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error(`1С не ответила вовремя (код ${r.status})`);
  }
  if (!r.ok) throw new Error(d.error || `Ошибка запроса, код ${r.status}`);
  if (!d.result?.ok) throw new Error(d.result?.error || "Ошибка обмена с 1С");
  return d.result;
};

const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch {
    return await fn();
  }
};

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

export const matchPortion = (base: string, opts: MatchOptions, rows: InvoiceItem[]) =>
  withRetry<MatchItem[]>(async () => {
    const res = await odataPost("nomen_match", base, {
      mode: opts.mode,
      by: opts.by,
      exact: opts.exact,
      check_barcodes: opts.checkBarcodes,
      rows: rows.map((x) => ({ article: x.article, barcode: x.barcode, name: x.name })),
    });
    return res.items;
  });

export const addBarcodesPortion = (base: string, rows: { key: string; barcode: string }[]) =>
  withRetry<BarcodeWriteResult[]>(async () => {
    const res = await odataPost("nomen_add_barcodes", base, { rows });
    return res.items;
  });
