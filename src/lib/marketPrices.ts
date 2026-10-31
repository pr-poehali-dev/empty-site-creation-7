import { permHeaders } from "@/hooks/useReceivingPerms";

export const MARKET_PRICES_URL =
  "https://functions.poehali.dev/07b7a61f-8174-437a-8dfe-fa779828a911";

export type SiteKey = "wb_ru" | "oz_ru" | "ym_ru" | "mv_ru" | "wb_by" | "oz_by";
export type TotalKey = "total_ru" | "total_by";

export const SITE_COLUMNS: { key: SiteKey; title: string; cur: string }[] = [
  { key: "wb_ru", title: "WB РФ", cur: "₽" },
  { key: "oz_ru", title: "Ozon РФ", cur: "₽" },
  { key: "ym_ru", title: "Я.Маркет", cur: "₽" },
  { key: "mv_ru", title: "М.Видео", cur: "₽" },
  { key: "wb_by", title: "WB РБ", cur: "BYN" },
  { key: "oz_by", title: "Ozon РБ", cur: "BYN" },
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
  no_proxy: "нет прокси",
  no_traffic: "нет трафика",
  vps_offline: "сервер не на связи",
  captcha: "капча даже браузеру",
  queue_full: "очередь переполнена",
  timeout: "браузер не дождался",
  proxy_error: "прокси не отвечает",
  oz_check: "нужна проверка Ozon",
};

export type SiteMethod = "direct" | "proxy" | "browser";

export const METHOD_TITLES: Record<SiteMethod, string> = {
  direct: "напрямую",
  proxy: "через прокси",
  browser: "через браузер",
};

export const BROWSER_SITES: SiteKey[] = ["wb_ru", "wb_by", "oz_ru", "oz_by"];

export interface VpsState {
  registered: boolean;
  host: string | null;
  port: number | null;
  version: string | null;
  latest_version: string;
  registered_at: string | null;
  last_ok_at: string | null;
  last_status: string | null;
  last_message: string | null;
  info: {
    uptime?: number;
    done?: number;
    failed?: number;
    running?: number;
    waiting?: number;
    browser?: boolean;
    oz_pass?: Partial<Record<"ru" | "by", number>>;
  };
  command?: string;
  expires_hours?: number;
}

export const vpsCall = (action: string) => post({ action }) as Promise<VpsState>;

export interface OzClip {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OzShot {
  open: boolean;
  state: "captcha" | "blocked" | "loading" | "ok";
  crop: OzClip;
  cropped: boolean;
  image: string;
  url: string;
}

export const ozCall = (action: string, extra: Record<string, unknown>) =>
  post({ action, ...extra }) as Promise<OzShot>;

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
  post({ action: "lookup", models }) as Promise<{
    rows: PriceRow[];
    can_edit: boolean;
    is_owner: boolean;
    sites: SiteKey[];
  }>;

export interface ProxyInfo {
  provider: string;
  title: string;
  has_key: boolean;
  key_mask: string;
  package_id: number | null;
  proxy_ru: boolean;
  proxy_by: boolean;
  proxy_ru_mobile?: boolean;
  proxy_by_mobile?: boolean;
  balance?: string | number;
  error?: string;
  package?: ProxyPackage;
  mobile_package?: ProxyPackage;
}

export interface ProxyPackage {
  id: number;
  name: string;
  total?: number;
  used?: number;
  expires_at?: number;
  prepaid?: boolean;
}

export interface SiteSetting {
  site: SiteKey;
  title: string;
  country: "ru" | "by";
  cur: string;
  enabled: boolean;
  via_proxy: boolean;
  method: SiteMethod;
  test_brand: string;
  test_model: string;
  last_status: string | null;
  last_message: string | null;
  last_price: string | null;
  last_title: string | null;
  last_at: string | null;
}

export interface MarketSettings {
  proxies: ProxyInfo[];
  sites: SiteSetting[];
  warning?: string;
}

export const settingsCall = (action: string, extra: Record<string, unknown> = {}) =>
  post({ action, ...extra }) as Promise<MarketSettings>;

export const mb = (bytes?: number) =>
  bytes == null ? "—" : `${(bytes / 1048576).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;

export const fetchSitePrice = (site: SiteKey, brand: string, model: string) =>
  post({ action: "fetch", site, brand, model }) as Promise<{ row: PriceRow; status: string }>;

export const excludeCard = (site: SiteKey, brand: string, model: string) =>
  post({ action: "exclude", site, brand, model }) as Promise<{ row: PriceRow; status: string }>;

export const confirmPrice = (site: SiteKey, brand: string, model: string) =>
  post({ action: "confirm", site, brand, model }) as Promise<{ row: PriceRow }>;

export interface PriceHistoryItem {
  status: string;
  price: string | number | null;
  title: string | null;
  url: string | null;
  created_at: string;
  who: string | null;
}

export const priceHistory = (site: SiteKey, brand: string, model: string) =>
  post({ action: "history", site, brand, model }) as Promise<{ items: PriceHistoryItem[] }>;

export type FilterKey = "preps" | "parts" | "synonyms";

export interface Plaus {
  site_on: boolean;
  site_ratio: number | string;
  cross_on: boolean;
  cross_ratio: number | string;
}

export interface FilterSet {
  preps: string[];
  parts: string[];
  synonyms: string[];
  plaus: Plaus;
}

export interface ExcludedCard {
  id: number;
  site: SiteKey;
  url: string | null;
  title: string | null;
  price: number | null;
  created_at: string;
  brand: string | null;
  model: string | null;
}

export interface FiltersState {
  filters: FilterSet;
  defaults: FilterSet;
  excluded: ExcludedCard[];
}

export const filtersCall = (action: string, extra: Record<string, unknown> = {}) =>
  post({ action, ...extra }) as Promise<FiltersState>;

export const saveTotal = (field: TotalKey, brand: string, model: string, value: string) =>
  post({ action: "set_total", field, brand, model, value }) as Promise<{ row: PriceRow }>;

const SEARCH_URL: Record<SiteKey, (q: string) => string> = {
  wb_ru: (q) => `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}&sort=priceup`,
  wb_by: (q) => `https://www.wildberries.by/catalog/0/search.aspx?search=${q}&sort=priceup`,
  oz_ru: (q) => `https://www.ozon.ru/search/?text=${q}&sorting=price&from_global=true`,
  oz_by: (q) => `https://ozon.by/search/?text=${q}&sorting=price&from_global=true`,
  ym_ru: (q) => `https://market.yandex.ru/search?text=${q}&how=aprice`,
  mv_ru: (q) => `https://www.mvideo.ru/product-list-page?q=${q}`,
};

/** Куда вести по нажатию «Открыть на сайте»: карточка найденного товара или поиск модели. */
export const sourceUrl = (site: SiteKey, row?: PriceRow): { url: string; exact: boolean } | null => {
  if (!row) return null;
  const direct = row[`${site}_url`];
  if (typeof direct === "string" && direct.startsWith("http")) return { url: direct, exact: true };
  const q = `${row.brand ?? ""} ${row.model ?? ""}`.trim();
  if (!q) return null;
  return { url: SEARCH_URL[site](encodeURIComponent(q)), exact: false };
};

export const shortDate = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
};