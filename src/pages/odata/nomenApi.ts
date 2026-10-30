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

export type MatchField = SearchBy | "barcode";

export const FIELD_TITLES: Record<MatchField, string> = {
  article: "Артикул",
  name: "Наименование",
  barcode: "Штрихкод",
};

export const FIELD_SHORT: Record<MatchField, string> = {
  article: "А",
  name: "Н",
  barcode: "Ш",
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
  country?: string;
  weight?: number | null;
  tnved?: string;
  cells?: string[];
}

export interface ParsedInvoice {
  file_name: string;
  items: InvoiceItem[];
  columns?: { index: number; title: string; field: string | null }[];
}

export interface Card1C {
  key: string;
  code: string;
  name: string;
  article: string;
  deleted: boolean;
  matched?: MatchField[];
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
  hits?: Partial<Record<MatchField, boolean | null>>;
  error?: string | null;
  card_key?: string;
  bc?: BarcodeCheck;
}

export interface MatchOptions {
  mode: SearchMode;
  by: SearchBy;
  exact: boolean;
  checkBarcodes: boolean;
  fields?: MatchField[];
}

export interface BarcodeWriteResult {
  key: string;
  barcode: string;
  state: "added" | "exists" | "taken" | "error";
  owner?: { code: string; name: string };
  error?: string;
}

export class NetTimeout extends Error {}

const fetchWithTimeout = async (url: string, init: RequestInit, ms?: number) => {
  if (!ms) return fetch(url, init);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new NetTimeout("Нет ответа — слабая связь");
    throw e;
  } finally {
    clearTimeout(t);
  }
};

const odataPost = async (action: string, base: string, payload: object, timeoutMs?: number) => {
  const r = await fetchWithTimeout(`${ODATA_URL}?action=${action}&base=${encodeURIComponent(base)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
    },
    body: JSON.stringify({ action, base, ...payload }),
  }, timeoutMs);
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
    body: JSON.stringify({ action: "parse", file: b64, file_name: fileName, with_cells: true }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Не удалось разобрать счёт");
  return d;
};

const MATCH_TIMEOUT = 40000;
const MATCH_TRIES = 4;

export const matchPortion = async (
  base: string,
  opts: MatchOptions,
  rows: InvoiceItem[],
  onRetry?: (attempt: number) => void,
): Promise<MatchItem[]> => {
  let last: unknown;
  for (let a = 1; a <= MATCH_TRIES; a++) {
    if (a > 1) {
      onRetry?.(a - 1);
      await new Promise((r) => setTimeout(r, 1500 * (a - 1)));
    }
    try {
      return await matchOnce(base, opts, rows);
    } catch (e) {
      last = e;
    }
  }
  throw last;
};

const matchOnce = async (base: string, opts: MatchOptions, rows: InvoiceItem[]) => {
    const res = await odataPost("nomen_match", base, {
      mode: opts.mode,
      by: opts.by,
      exact: opts.exact,
      check_barcodes: opts.checkBarcodes,
      fields: opts.fields,
      rows: rows.map((x) => ({ article: x.article, barcode: x.barcode, name: x.name })),
    }, MATCH_TIMEOUT);
    return res.items as MatchItem[];
};

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
  basis?: string;
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

export const normCountry = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я]/g, "");

export const countryByName = (name: string | undefined, countries: Country1C[]) => {
  const n = normCountry(name || "");
  return n ? countries.find((c) => normCountry(c.name) === n) : undefined;
};

export type TraceKind = "rnpt" | "gtd";

export const numberKind = (n: string): TraceKind | null => {
  const parts = n.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 4) return "rnpt";
  if (parts.length === 3) return "gtd";
  return null;
};

export interface ItemTrace {
  traceable: boolean;
  kind: TraceKind | null;
  number: string;
}

export const itemTrace = (x: NewItem): ItemTrace | null => {
  if (!x.countryKey) return null;
  const rn = (x.fileRnpt || "").trim();
  const gt = (x.fileGtd || "").trim();
  if (rn) return { traceable: true, kind: "rnpt", number: rn };
  if (gt) return { traceable: false, kind: "gtd", number: gt };
  return { traceable: false, kind: null, number: "" };
};

export const loadCountries = async (base: string): Promise<Country1C[]> => {
  const r = await odataPost("nomen_countries", base, {});
  if (!r.ok) throw new Error(r.error || "Не загрузил страны");
  return r.countries || [];
};

export const isTraceable = (countryKey: string, countries: Country1C[]) => {
  const c = countries.find((x) => x.key === countryKey);
  return !!c && !NOT_TRACEABLE.includes(c.code);
};

const WEIGHT_SAMPLE = 10;

const words = (s: string) =>
  new Set(
    stripPromo(s)
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

export interface FoundNomen {
  name: string;
  code: string;
  w: number;
  tnved: string;
  tnved_key: string;
}

export interface SearchResult extends TnvedKind {
  query: string;
  items: FoundNomen[];
}

export const searchNomen = async (base: string, query: string): Promise<SearchResult> => {
  const r = await odataPost("nomen_search", base, { query });
  if (!r.ok) throw new Error(r.error || "Не удалось найти");
  return r;
};

export const createGroup = async (base: string, name: string, parent: string): Promise<{ key: string; name: string }> => {
  const r = await odataPost("nomen_group_create", base, { name, parent });
  if (!r.ok) throw new Error(r.error || "Не удалось создать группу");
  return r.group;
};

const PORTION_TIMEOUT = 40000;

export const withTries = async <T,>(fn: () => Promise<T>, onRetry?: (attempt: number) => void): Promise<T> => {
  let last: unknown;
  for (let a = 1; a <= MATCH_TRIES; a++) {
    if (a > 1) {
      onRetry?.(a - 1);
      await new Promise((r) => setTimeout(r, 1500 * (a - 1)));
    }
    try {
      return await fn();
    } catch (e) {
      last = e;
    }
  }
  throw last;
};

export const RETRIES = MATCH_TRIES - 1;

export const checkTnvedCodes = async (base: string, codes: string[], onRetry?: (a: number) => void) =>
  (await withTries(() => odataPost("tnved_check", base, { codes }, PORTION_TIMEOUT), onRetry)) as {
    found: Record<string, string>;
    missing: string[];
  };

export const createTnvedCodes = async (base: string, codes: string[], onRetry?: (a: number) => void) =>
  (await withTries(() => odataPost("tnved_create", base, { codes }, PORTION_TIMEOUT), onRetry)) as {
    created: Record<string, string>;
    already: Record<string, string>;
    remaining: string[];
    error?: string | null;
  };

export const loadTnvedPortion = async (
  base: string,
  kinds: string[],
  onRetry?: (a: number) => void,
): Promise<TnvedResult> => {
  const r = await withTries(() => odataPost("nomen_tnved", base, { kinds }, PORTION_TIMEOUT), onRetry);
  return { kinds: r.kinds || {}, countries: r.countries || [] };
};

export const loadTnved = async (base: string, kinds: string[]): Promise<TnvedResult> => {
  const r = await withRetry(() => odataPost("nomen_tnved", base, { kinds }));
  return { kinds: r.kinds || {}, countries: r.countries || [] };
};

const norm = (w: string) => w.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/gi, "");

const PROMO = new Set([
  "sale", "акция", "скидка", "скидки", "распродажа", "уценка", "уценен", "уцененный", "уцененная",
  "новинка", "new", "хит", "hit", "promo", "промо", "суперцена", "выгодно", "выгода", "спеццена",
  "суперскидка", "ликвидация", "бестселлер", "лучшаяцена", "суперпредложение",
]);

const isPromo = (w: string) => /!\s*["»')\]]*$/.test(w) || PROMO.has(norm(w)) || /^-?\d+%$/.test(w.replace(/[^\d%-]/g, "") || "x");

export const stripPromo = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !isPromo(w) && norm(w) !== "")
    .map((w) => w.replace(/^[^a-zа-яё0-9]+/i, ""))
    .join(" ");

export const productKind = (name: string, brands: string[] = []) => {
  const words = stripPromo(name).split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const stop = new Set(brands.map(norm).filter(Boolean));
  const idx = words.findIndex((w, i) => i > 0 && (/[A-Za-z0-9]/.test(w) || stop.has(norm(w))));
  return (idx > 0 ? words.slice(0, idx) : words.slice(0, 1)).join(" ");
};

export interface NewItem {
  idx: number;
  category?: string;
  skip?: boolean;
  fileGtd?: string;
  fileRnpt?: string;
  article: string;
  barcode: string;
  name: string;
  invoicePrice: number | null;
  kind: string;
  groupKey: string;
  price: string;
  weight: string;
  weightAuto: boolean;
  priceSrc?: "site" | "manual";
  weightSrc?: "site" | "file";
  fileWeight?: string;
  tnvedSrc?: "file" | "similar";
  fileTnved?: string;
  tnvedMissing?: boolean;
  countrySrc?: "site" | "file";
  fileCountry?: string;
  siteUrl?: string;
  countryKey: string;
  countryTouched: boolean;
  tnved: string;
  tnvedKey: string;
  search?: string;
  found?: SearchResult;
}

export const toNumber = (s: string) => {
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export const NAME_MAX = 100;

export const nameTooLong = (x: NewItem) => x.name.trim().length > NAME_MAX;

export const newItemProblems = (x: NewItem): string[] => {
  const p: string[] = [];
  if (!x.name.trim()) p.push("наименование");
  else if (nameTooLong(x)) p.push("наименование > 100");
  if (!x.groupKey) p.push("группа");
  if (!(toNumber(x.weight) > 0)) p.push("вес");
  if (!/^\d{10}$/.test(x.tnved.trim())) p.push("ТНВЭД");
  else if (x.tnvedMissing) p.push("ТНВЭД нет в 1С");
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
  price_kind?: string;
}

export interface PriceKind {
  key: string;
  name: string;
}

export const loadPriceKinds = async (base: string): Promise<PriceKind[]> =>
  (await withRetry(() => odataPost("price_kinds", base, {}))).kinds || [];

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
        traceable: x.countryKey ? itemTrace(x)?.traceable ?? false : undefined,
      })),
    })
  ).items;

export const setBasePrices = async (
  base: string,
  rows: { key: string; price: number }[],
  comment: string,
  priceKind?: string,
): Promise<PriceDocResult> => {
  try {
    return await odataPost("nomen_set_prices", base, { rows, comment, price_kind: priceKind });
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
export type SiteId = "" | "weissgauff";
export type PriceMode = "price" | "old";

export interface SiteSettings {
  site: SiteId;
  wgPrice: PriceMode;
}

export const SITES: { id: SiteId; label: string }[] = [
  { id: "", label: "Не искать" },
  { id: "weissgauff", label: "weissgauff.ru" },
];

export const siteLabel = (id: SiteId) => SITES.find((s) => s.id === id)?.label || "";

export interface SiteProduct {
  found: boolean;
  reason?: string;
  url?: string;
  title?: string;
  price?: number | null;
  old_price?: number | null;
  weight?: number | null;
  country?: string;
}

export const sitePrice = (p: SiteProduct, s: SiteSettings): number | null =>
  s.site === "weissgauff" ? (s.wgPrice === "old" ? p.old_price ?? null : p.price ?? null) : null;

export const siteLookup = async (base: string, site: SiteId, article: string): Promise<SiteProduct> => {
  const r = await fetch(`${ODATA_URL}?action=site_lookup&base=${encodeURIComponent(base)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
    },
    body: JSON.stringify({ action: "site_lookup", base, site, article }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.result?.ok) throw new Error(d?.result?.error || d?.error || "Сайт не ответил");
  return d.result;
};