import { permHeaders } from "@/hooks/useReceivingPerms";

export const MARKET_PRICES_URL =
  "https://functions.poehali.dev/07b7a61f-8174-437a-8dfe-fa779828a911";

export type SiteKey = "wb_ru" | "mv_ru" | "wb_by";
export type TotalKey = "total_ru" | "total_by";

export const SITE_COLUMNS: { key: SiteKey; title: string; cur: string }[] = [
  { key: "wb_ru", title: "WB РФ", cur: "₽" },
  { key: "mv_ru", title: "М.Видео", cur: "₽" },
  { key: "wb_by", title: "WB РБ", cur: "BYN" },
];

export const TOTAL_COLUMNS: { key: TotalKey; title: string; cur: string }[] = [
  { key: "total_ru", title: "Цена РФ", cur: "₽" },
  { key: "total_by", title: "Цена РБ", cur: "BYN" },
];

export type PriceRow = Record<string, string | number | boolean | null> & {
  brand_key: string;
  model_key: string;
};

const cleanModel = (brand: string, model: string) => {
  const m = (model || "").trim();
  const b = (brand || "").trim();
  if (b && m.toLowerCase().startsWith(b.toLowerCase() + " ")) return m.slice(b.length).trim();
  return m;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export const modelKey = (brand: unknown, model: unknown) => {
  const b = String(brand ?? "");
  const m = String(model ?? "");
  return `${norm(b)}|${norm(cleanModel(b, m))}`;
};

export const STATUS_TEXT: Record<string, string> = {
  not_found: "не найдено",
  blocked: "сайт не пустил",
  error: "ошибка сайта",
};

const post = async (body: Record<string, unknown>) => {
  const r = await fetch(MARKET_PRICES_URL, {
    method: "POST",
    headers: permHeaders(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка");
  return d;
};

export const lookupPrices = (models: { brand: unknown; model: unknown }[]) =>
  post({ action: "lookup", models }) as Promise<{ rows: PriceRow[]; can_edit: boolean }>;

export const fetchSitePrice = (site: SiteKey, brand: string, model: string) =>
  post({ action: "fetch", site, brand, model }) as Promise<{ row: PriceRow; status: string }>;

export const saveTotal = (field: TotalKey, brand: string, model: string, value: string) =>
  post({ action: "set_total", field, brand, model, value }) as Promise<{ row: PriceRow }>;

export const shortDate = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
};
