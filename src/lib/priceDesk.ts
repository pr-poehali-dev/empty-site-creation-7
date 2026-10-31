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
}

export interface DeskSet {
  id: number;
  title: string;
  source_type: string;
  source_id: number | null;
  rate_by_per_100_rub: number | string | null;
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

const call = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const r = await fetch(`${SEARCH_DICTS_URL}?section=desk`, {
    method: "POST",
    headers: permHeaders(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка");
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

export const PARSE_TEXT: Record<DeskParse, { label: string; cls: string }> = {
  none: { label: "не разобран", cls: "text-muted-foreground" },
  parsed: { label: "разобран", cls: "text-emerald-300" },
  doubtful: { label: "сомнительно", cls: "text-amber-300" },
  manual: { label: "вручную", cls: "text-sky-300" },
};
