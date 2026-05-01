const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";

function authHeaders() {
  const token = localStorage.getItem("auth_token") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function postAction<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  const resp = await fetch(ORDERS_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Ошибка сервера");
  return data as T;
}

export interface ServerOrderItem {
  id: number;
  product_id: number | null;
  name: string;
  article: string | null;
  quantity: number;
  price: number;
  amount: number;
  is_temp: boolean;
  temp_product_id: number | null;
  has_uuid: boolean;
  from_bulk: boolean;
}

export interface ItemPayload {
  product_id: number | null;
  temp_product_id?: number | null;
  name: string;
  quantity: number;
  price: number;
  is_temp?: boolean;
  has_uuid?: boolean;
  from_bulk?: boolean;
}

export const orderApi = {
  createDraft: () => postAction("create_draft", {}) as Promise<{ id: number }>,
  addItem: (orderId: number, item: ItemPayload) =>
    postAction<{ item: ServerOrderItem; total_amount: number }>("add_item", { order_id: orderId, item: item as unknown as Record<string, unknown> }),
  addItemsBatch: (orderId: number, items: ItemPayload[]) =>
    postAction<{ items: ServerOrderItem[]; total_amount: number }>("add_items_batch", { order_id: orderId, items: items as unknown as Record<string, unknown>[] }),
  updateItem: (itemId: number, fields: { quantity?: number; price?: number }) =>
    postAction<{ ok: boolean; amount: number; total_amount: number }>("update_item", { item_id: itemId, ...fields }),
  deleteItem: (itemId: number) =>
    postAction<{ ok: boolean; total_amount: number }>("delete_item", { item_id: itemId }),
  updateHeader: (orderId: number, fields: { customer_name?: string; comment?: string }) =>
    postAction<{ ok: boolean }>("update_header", { order_id: orderId, ...fields }),
};