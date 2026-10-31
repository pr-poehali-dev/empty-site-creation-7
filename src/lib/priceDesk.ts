import { SEARCH_DICTS_URL } from "@/components/search-dicts/api";
import { permHeaders } from "@/hooks/useReceivingPerms";

export type DeskParse = "none" | "parsed" | "doubtful" | "manual";

export interface DeskItem {
  id: number;
  product_id: number | null;
  temp_product_id: number | null;
  is_new: boolean;
  name: string;
  quantity: number | string | null;
  article: string | null;
  group: string | null;
  search_group: string | null;
  brand: string | null;
  model: string | null;
  feature: string | null;
  parse_status: DeskParse | null;
  card_brand: string | null;
  price_base: number | string | null;
  price_base_changed_at: string | null;
  price_by: number | string | null;
  price_ru: number | string | null;
  price_by_manual: boolean;
  price_ru_manual: boolean;
  new_base: number | string | null;
  new_base_source: BaseSource | null;
  price_base_parsed: boolean;
}

export type BaseSource = "avg_by" | "avg_ru" | "manual";

export const BASE_SOURCE_TEXT: Record<BaseSource, string> = {
  avg_by: "средняя РБ",
  avg_ru: "средняя РФ",
  manual: "вручную",
};

export interface BasePreview {
  total: number;
  replace: number;
  first: number;
  big: { name: string; old: number | string; new: number | string }[];
}

export type PriceField = "by" | "ru";

export type ItemPrices = Pick<DeskItem, "id" | "price_by" | "price_ru" | "price_by_manual" | "price_ru_manual">;

export interface DeskSet {
  id: number;
  title: string;
  source_type: string;
  source_id: number | null;
  rate_by_per_100_rub: number | string | null;
  percent_of_base: number | string | null;
  updated_at: string;
}

export interface DeskSetShort extends DeskSet {
  items: number;
}

export interface ParseCounts {
  parsed: number;
  doubtful: number;
  no_brand: number;
  skipped: number;
}

const ACTION_NAMES: Record<string, string> = {
  from_order: "Создание ценового стола",
  list: "Загрузка списка ценовых столов",
  get: "Загрузка ценового стола",
  parse: "Разбор товаров",
  save_item: "Сохранение бренда и модели",
  rate: "Сохранение курса",
  percent: "Сохранение процента",
  calc: "Расчёт цен",
  price: "Сохранение цены",
  fill_base: "Подстановка Новой Базовой",
  new_base: "Сохранение Новой Базовой",
  base_preview: "Проверка перед записью Базовой",
  write_base: "Запись Базовой цены",
};

const call = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const what = ACTION_NAMES[String(body.action)] || "Действие";
  let r: Response;
  try {
    r = await fetch(`${SEARCH_DICTS_URL}?section=desk`, {
      method: "POST",
      headers: permHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`${what}: нет связи с сервером — проверьте интернет и попробуйте ещё раз`);
  }
  const d = await r.json().catch(() => ({ error: "" }));
  if (!r.ok) throw new Error(`${what}: ${d.error || `сервер ответил ошибкой (код ${r.status})`}`);
  return d as T;
};

export const deskFromOrder = (orderId: number) => call<{ id: number }>({ action: "from_order", order_id: orderId });
export const deskList = () => call<{ sets: DeskSetShort[] }>({ action: "list" });
export const deskGet = (setId: number) => call<{ set: DeskSet; items: DeskItem[] }>({ action: "get", set_id: setId });
export const deskParse = (setId: number, itemIds: number[] = []) =>
  call<{ set: DeskSet; items: DeskItem[]; counts: ParseCounts }>({ action: "parse", set_id: setId, item_ids: itemIds });
export const deskSaveItem = (setId: number, itemId: number, brand: string, model: string) =>
  call<{ ok: boolean }>({ action: "save_item", set_id: setId, item_id: itemId, brand, model });
export const deskSaveRate = (setId: number, rate: string) =>
  call<{ rate: number | null }>({ action: "rate", set_id: setId, rate });

export const deskSavePercent = (setId: number, percent: string) =>
  call<{ percent: number | string | null }>({ action: "percent", set_id: setId, percent });
export const deskCalc = (setId: number, includeManual: boolean) =>
  call<{ set: DeskSet; items: DeskItem[] }>({ action: "calc", set_id: setId, include_manual: includeManual });
export const deskSavePrice = (setId: number, itemId: number, field: PriceField, value: string, reset = false) =>
  call<{ item: ItemPrices }>({ action: "price", set_id: setId, item_id: itemId, field, value, reset });

export const deskFillBase = (setId: number, source: "avg_by" | "avg_ru") =>
  call<{ set: DeskSet; items: DeskItem[]; filled: number }>({ action: "fill_base", set_id: setId, source });
export const deskSaveNewBase = (setId: number, itemId: number, value: string) =>
  call<{ item: Pick<DeskItem, "id" | "new_base" | "new_base_source"> }>({
    action: "new_base",
    set_id: setId,
    item_id: itemId,
    value,
  });
export const deskBasePreview = (setId: number) => call<BasePreview>({ action: "base_preview", set_id: setId });
export const deskWriteBase = (setId: number) =>
  call<{ set: DeskSet; items: DeskItem[]; written: number }>({ action: "write_base", set_id: setId });

export const PARSE_TEXT: Record<DeskParse, { label: string; cls: string }> = {
  none: { label: "не разобран", cls: "text-muted-foreground" },
  parsed: { label: "разобран", cls: "text-emerald-300" },
  doubtful: { label: "сомнительно", cls: "text-amber-300" },
  manual: { label: "вручную", cls: "text-sky-300" },
};