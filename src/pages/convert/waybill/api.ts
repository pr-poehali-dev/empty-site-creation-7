import * as XLSX from "xlsx";

const ODATA_URL = "https://functions.poehali.dev/74601b0f-9a91-4dbb-aef5-3cf2cadf93c8";

export type DocType = "sale" | "receipt";

export interface WbDoc {
  key: string;
  number: string;
  date: string;
  posted: boolean;
  counterparty: string;
  amount: number;
  comment: string;
}

export interface PriceHit {
  doc: string;
  date: string;
  price: number;
}

export interface WbItem {
  key: string;
  name: string;
  article: string;
  article_auto: boolean;
  barcodes: string[];
  group: string;
  weight: number;
  tnved: string;
  price: number;
  price_doc: string;
  qty: number;
  price_diff: PriceHit[];
  variants: { price: number; qty: number }[];
}

export type PriceRule = "max" | "min" | "avg";

export const PRICE_RULES: { value: PriceRule; label: string }[] = [
  { value: "max", label: "Самая большая" },
  { value: "min", label: "Самая маленькая" },
  { value: "avg", label: "Средняя" },
];

export const isMultiPrice = (x: WbItem) => (x.variants?.length || 0) > 1;

export const priceByRule = (x: WbItem, rule: PriceRule) => {
  const v = x.variants || [];
  if (v.length < 2) return x.price;
  if (rule === "max") return Math.max(...v.map((p) => p.price));
  if (rule === "min") return Math.min(...v.map((p) => p.price));
  const qty = v.reduce((a, p) => a + p.qty, 0);
  const avg = qty > 0 ? v.reduce((a, p) => a + p.price * p.qty, 0) / qty : v.reduce((a, p) => a + p.price, 0) / v.length;
  return Math.round(avg * 100) / 100;
};

export const finalPrice = (x: WbItem, rule: PriceRule, picks: Record<string, number>) =>
  isMultiPrice(x) && picks[x.key] !== undefined ? picks[x.key] : priceByRule(x, rule);

export interface WbBuild {
  items: WbItem[];
  lines: number;
  docs: { number: string; date: string }[];
}

const post = async (action: string, base: string, payload: object, timeoutMs = 60000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${ODATA_URL}?action=${action}&base=${encodeURIComponent(base)}`, {
      method: "POST",
      signal: ctrl.signal,
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
    return d;
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("1С не ответила вовремя");
    throw e;
  } finally {
    clearTimeout(t);
  }
};

export const listWaybills = async (base: string, docType: DocType, dateFrom: string, dateTo: string) =>
  (await post("wb_list", base, { doc_type: docType, date_from: dateFrom, date_to: dateTo })).docs as WbDoc[];

export const buildWaybillItems = async (base: string, docType: DocType, keys: string[]) =>
  (await post("wb_build", base, { doc_type: docType, keys }, 90000)) as WbBuild;

export interface Twin {
  key: string;
  name: string;
  article: string;
  group: string;
}

export const findTwins = async (base: string, articles: string[]) => {
  const out: Record<string, Twin[]> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < articles.length; i += 20) chunks.push(articles.slice(i, i + 20));
  for (let i = 0; i < chunks.length; i += 3) {
    const res = await Promise.all(chunks.slice(i, i + 3).map((c) => post("wb_twins", base, { articles: c }, 60000)));
    res.forEach((r) => Object.assign(out, r.twins || {}));
  }
  return out;
};

export interface ArtResult {
  key: string;
  state: "written" | "skipped" | "error";
  article?: string;
  error?: string;
}

export const writeArticles = async (base: string, rows: { key: string; article: string }[]) => {
  const out: ArtResult[] = [];
  for (let i = 0; i < rows.length; i += 40) {
    const r = await post("wb_set_articles", base, { rows: rows.slice(i, i + 40) }, 90000);
    out.push(...(r.results || []));
  }
  return out;
};

const CYR = "АВЕКМНОРСТУХ";
const LAT = "ABEKMHOPCTYX";

export const normArt = (v: string) =>
  v
    .toUpperCase()
    .replace(/[\s№]+/g, "")
    .replace(/[АВЕКМНОРСТУХ]/g, (c) => LAT[CYR.indexOf(c)]);

const CATALOG_URL = "https://functions.poehali.dev/85960a37-dc7f-4ace-b024-444033b366d7";

export type MatchField = "article" | "name" | "barcode";

export const MATCH_FIELDS: { value: MatchField; label: string; short: string }[] = [
  { value: "article", label: "Артикул", short: "А" },
  { value: "name", label: "Наименование", short: "Н" },
  { value: "barcode", label: "Штрихкод", short: "Ш" },
];

export interface CatCard {
  id: number;
  article: string;
  name: string;
  group: string;
  matched: MatchField[];
  in_name?: boolean;
}

export interface CatMatch {
  status: "found" | "partial" | "missing";
  cards: CatCard[];
}

export const matchCatalog = async (items: WbItem[], fields: MatchField[]) => {
  const r = await fetch(CATALOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": localStorage.getItem("auth_token") || "" },
    body: JSON.stringify({
      action: "catalog_match",
      fields,
      items: items.map((x) => ({ key: x.key, article: x.article, name: x.name, barcodes: x.barcodes })),
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Ошибка сверки, код ${r.status}`);
  return d.items as Record<string, CatMatch>;
};

export const withoutAutoArticles = (items: WbItem[]) =>
  items.map((x) => (x.article_auto ? { ...x, article: "", article_auto: false } : x));

export const KNOWN_BRANDS = ["GARLYN", "REDMOND", "RED SOLUTION", "WEISSGAUFF", "MIDEA"];

export const guessBrand = (name: string, group: string) => {
  const up = name.toUpperCase();
  const known = KNOWN_BRANDS.find((b) => up.includes(b));
  if (known) return known;
  const g = group.trim();
  if (g && up.includes(g.toUpperCase())) return g;
  const latin = name.match(/\b[A-Z][A-Z0-9-]{2,}\b/);
  return latin && !/\d/.test(latin[0]) ? latin[0] : "";
};

const HEADERS = ["Артикул", "Наименование", "Штрихкод", "Бренд", "Вес", "Код ТНВЭД", "Цена"];

export const buildCatalogXlsx = (
  items: WbItem[],
  priceOf: (x: WbItem) => number,
  brandOf: (x: WbItem) => string,
) => {
  const data = items.map((x) => [
    x.article,
    x.name,
    x.barcodes.join(", "),
    brandOf(x),
    x.weight || "",
    x.tnved,
    priceOf(x),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...data]);
  ws["!cols"] = [16, 60, 18, 16, 8, 13, 12].map((wch) => ({ wch }));
  data.forEach((_, i) => {
    for (const c of [0, 2, 5]) {
      const ref = XLSX.utils.encode_cell({ r: i + 1, c });
      if (ws[ref]) ws[ref].t = "s";
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Каталог");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
};

export const catalogFileName = (baseTitle: string, docType: DocType, numbers: string[]) => {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const kind = docType === "sale" ? "Реализации" : "Поступления";
  const nums = numbers.length <= 3 ? numbers.join("_") : `${numbers.length}_накл`;
  const src = `${baseTitle}_${kind}_${nums}`.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 80);
  return `Каталог_${src}_${stamp}.xlsx`;
};
