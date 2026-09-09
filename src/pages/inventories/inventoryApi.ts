import {
  INVENTORIES_URL,
  Inventory,
  InventoryItem,
  InventoryListItem,
  ProductSearchItem,
  WholesalerOption,
} from "./types";

function authHeaders() {
  const token = localStorage.getItem("auth_token") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const resp = await fetch(INVENTORIES_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || "Ошибка запроса");
  return data as T;
}

export async function fetchInventories(archived = false): Promise<{
  inventories: InventoryListItem[];
  wholesalers: WholesalerOption[];
  is_owner: boolean;
  can_delete: boolean;
}> {
  const url = archived ? `${INVENTORIES_URL}?archived=1` : INVENTORIES_URL;
  const resp = await fetch(url, { headers: authHeaders() });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || "Не удалось загрузить список");
  return data;
}

export async function fetchInventory(id: number): Promise<Inventory> {
  const resp = await fetch(`${INVENTORIES_URL}?id=${id}`, { headers: authHeaders() });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || "Не удалось загрузить инвентаризацию");
  return data;
}

export function createInventory(wholesalerId: number) {
  return post<{ id: number }>({ action: "create", wholesaler_id: wholesalerId });
}

/** Обычное удаление — уход в архив. Для всех, кроме владельца, это и есть удаление. */
export async function deleteInventory(id: number): Promise<void> {
  const resp = await fetch(`${INVENTORIES_URL}?id=${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.error || "Не удалось удалить");
  }
}

/** Стереть насовсем. Только владелец и только из архива. */
export async function purgeInventory(id: number): Promise<void> {
  const resp = await fetch(`${INVENTORIES_URL}?id=${id}&purge=1`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.error || "Не удалось удалить");
  }
}

export function restoreInventory(id: number) {
  return post<{ ok: boolean }>({ action: "restore", inventory_id: id });
}

export function searchProducts(
  inventoryId: number,
  query: string,
  mode: string,
  productGroup: string
) {
  return post<{ products: ProductSearchItem[] }>({
    action: "search_products",
    inventory_id: inventoryId,
    query,
    mode,
    product_group: productGroup || null,
  });
}

export function fetchProductGroups(inventoryId: number) {
  return post<{ groups: string[] }>({
    action: "product_groups",
    inventory_id: inventoryId,
  });
}

export function scanBarcode(inventoryId: number, barcode: string, exact: boolean) {
  return post<{ found: boolean; products: ProductSearchItem[]; product: ProductSearchItem | null }>({
    action: "scan_barcode",
    inventory_id: inventoryId,
    barcode,
    exact,
  });
}

export function addItem(inventoryId: number, productId: number, quantity: number) {
  return post<{ item: InventoryItem; total_amount: number }>({
    action: "add_item",
    inventory_id: inventoryId,
    product_id: productId,
    quantity,
  });
}

export function updateItem(
  inventoryId: number,
  itemId: number,
  patch: { quantity?: number; price?: number }
) {
  return post<{ item: InventoryItem; total_amount: number }>({
    action: "update_item",
    inventory_id: inventoryId,
    item_id: itemId,
    ...patch,
  });
}

export function deleteItem(inventoryId: number, itemId: number) {
  return post<{ ok: boolean; total_amount: number }>({
    action: "delete_item",
    inventory_id: inventoryId,
    item_id: itemId,
  });
}

export function updateHeader(inventoryId: number, comment: string) {
  return post<{ ok: boolean }>({
    action: "update_header",
    inventory_id: inventoryId,
    comment,
  });
}

export function recalcZeroPrices(inventoryId: number) {
  return post<{ updated: number; total_zero: number; total_amount: number }>({
    action: "recalc_zero_prices",
    inventory_id: inventoryId,
  });
}

export function getVisibility(inventoryId: number) {
  return post<{ shared_manager_ids: number[]; managers: { id: number; name: string }[] }>({
    action: "get_visibility",
    inventory_id: inventoryId,
  });
}

export function setVisibility(inventoryId: number, sharedManagerIds: number[]) {
  return post<{ ok: boolean; shared_manager_ids: number[] }>({
    action: "set_visibility",
    inventory_id: inventoryId,
    shared_manager_ids: sharedManagerIds,
  });
}