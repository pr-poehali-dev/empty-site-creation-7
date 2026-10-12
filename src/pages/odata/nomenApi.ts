const INVOICE_URL = "https://functions.poehali.dev/da75537b-bd2c-4bb3-b3ee-5cd90f17c9a2";
const ODATA_URL = "https://functions.poehali.dev/74601b0f-9a91-4dbb-aef5-3cf2cadf93c8";

export type SearchBy = "article" | "name";
export type SearchMode = "single" | "all";

export const SEARCH_BY_TITLES: Record<SearchBy, string> = {
  article: "Артикул",
  name: "Наименование",
};

export const SEARCH_BY_SHORT: Record<SearchBy, string> = {
  article: "А",
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
  owner?: { code: string; name: string; article?: string } | null;
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

export interface Group1C {
  key: string;
  name: string;
  path: string;
}

export interface TnvedOption {
  key: string;
  code: string;
  count: number;
}

export interface SimilarWeight {
  name: string;
  code: string;
  w: number;
}

export interface Country1C {
  key: string;
  code: string;
  name: string;
}

export interface CountryKind {
  basis: string;
  similar: number;
  options: { key: string; count: number }[];
}

export interface TnvedKind {
  similar: number;
  options: TnvedOption[];
  weights?: SimilarWeight[];
  country?: CountryKind;
  error?: string | null;
}

export interface TnvedResult {
  kinds: Record<string, TnvedKind>;
  countries: Country1C[];
}

export const NOT_TRACEABLE = ["643", "112"];

export const isTraceable = (countryKey: string, countries: Country1C[]) => {
  const c = countries.find((x) => x.key === countryKey);
  return !!c && !NOT_TRACEABLE.includes(c.code);
};

const WEIGHT_SAMPLE = 10;

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/ё/g, "е")
      .split(/[^a-zа-я0-9]+/i)
      .filter(Boolean),
  );

export const similarWeights = (name: string, pool: SimilarWeight[] = []): SimilarWeight[] => {
  const mine = words(name);
  return pool
    .map((c) => {
      let hit = 0;
      words(c.name).forEach((w) => mine.has(w) && hit++);
      return { c, hit };
    })
    .sort((a, b) => b.hit - a.hit || a.c.name.localeCompare(b.c.name))
    .slice(0, WEIGHT_SAMPLE)
    .map((x) => x.c);
};

export const avgWeight = (list: SimilarWeight[]) =>
  list.length ? Math.round((list.reduce((s, x) => s + x.w, 0) / list.length) * 10) / 10 : 0;

export const fmtWeight = (n: number) => String(n).replace(".", ",");

export const loadGroups = async (base: string): Promise<Group1C[]> =>
  (await withRetry(() => odataPost("nomen_groups", base, {}))).groups;

export const loadTnved = async (base: string, kinds: string[]): Promise<TnvedResult> => {
  const r = await withRetry(() => odataPost("nomen_tnved", base, { kinds }));
  return { kinds: r.kinds || {}, countries: r.countries || [] };
};

export const productKind = (name: string) => {
  const words = name.trim().split(/\s+/);
  const idx = words.findIndex((w) => /[A-Za-z]/.test(w));
  return (idx > 0 ? words.slice(0, idx) : words.slice(0, 1)).join(" ");
};

export interface NewItem {
  idx: number;
  article: string;
  barcode: string;
  name: string;
  invoicePrice: number | null;
  kind: string;
  groupKey: string;
  price: string;
  weight: string;
  weightAuto: boolean;
  countryKey: string;
  countryTouched: boolean;
  tnved: string;
  tnvedKey: string;
}

export const toNumber = (s: string) => {
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export const newItemProblems = (x: NewItem): string[] => {
  const p: string[] = [];
  if (!x.name.trim()) p.push("наименование");
  if (!x.groupKey) p.push("группа");
  if (!(toNumber(x.price) > 0)) p.push("цена");
  if (!(toNumber(x.weight) > 0)) p.push("вес");
  if (!/^\d{10}$/.test(x.tnved.trim())) p.push("ТНВЭД");
  return p;
};

export type BarcodeWrite = "added" | "taken" | "error" | "none";

export interface ConflictCard extends Card1C {
  barcodes?: string[];
}

export interface CreateResult {
  idx: number;
  article: string;
  state: "created" | "exists" | "conflict" | "error";
  key?: string;
  code?: string;
  name?: string;
  barcode?: BarcodeWrite;
  barcode_error?: string;
  barcode_owner?: { code: string; name: string };
  country?: "set" | "none" | "error";
  country_error?: string;
  traceable?: boolean;
  card?: Card1C;
  cards?: ConflictCard[];
  error?: string;
}

export type Decision =
  | { kind: "create"; result: CreateResult }
  | { kind: "attach"; card: ConflictCard; barcode: BarcodeWrite; barcode_error?: string; barcode_owner?: { code: string; name: string } }
  | { kind: "skip" };

export interface PriceDocResult {
  ok: boolean;
  key?: string;
  number?: string;
  lines?: number;
  posted?: boolean;
  post_error?: string | null;
  error?: string;
}

export const createPortion = async (base: string, list: NewItem[], force = false): Promise<CreateResult[]> =>
  (
    await odataPost("nomen_create", base, {
      force,
      rows: list.map((x) => ({
        idx: x.idx,
        article: x.article.trim(),
        barcode: x.barcode.trim(),
        name: x.name.trim(),
        group_key: x.groupKey,
        weight: toNumber(x.weight),
        tnved: x.tnved.trim(),
        tnved_key: x.tnvedKey,
        country_key: x.countryKey,
      })),
    })
  ).items;

export const setBasePrices = async (
  base: string,
  rows: { key: string; price: number }[],
  comment: string,
): Promise<PriceDocResult> => {
  try {
    return await odataPost("nomen_set_prices", base, { rows, comment });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};

export const attachBarcode = async (base: string, key: string, barcode: string) =>
  (await odataPost("nomen_attach_barcode", base, { key, barcode })) as {
    barcode: BarcodeWrite;
    barcode_error?: string;
    barcode_owner?: { code: string; name: string };
  };