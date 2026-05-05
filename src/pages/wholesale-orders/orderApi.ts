const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";

function authHeaders() {
  const token = localStorage.getItem("auth_token") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export class VersionConflictError extends Error {
  serverVersion: string | null;
  constructor(serverVersion: string | null) {
    super("Версия устарела");
    this.name = "VersionConflictError";
    this.serverVersion = serverVersion;
  }
}

export interface LockInfo {
  locked: boolean;
  locked_by_user_id?: number;
  locked_by_name?: string;
  locked_at?: string;
  locked_session_id?: string;
  is_mine?: boolean;
}

export class LockedByOtherError extends Error {
  lock: LockInfo | null;
  constructor(lock: LockInfo | null, message?: string) {
    super(message || "Заявка редактируется другим пользователем");
    this.name = "LockedByOtherError";
    this.lock = lock;
  }
}

let currentSessionId: string | null = null;

export function setSessionId(id: string | null) {
  currentSessionId = id;
}

export function getSessionId(): string | null {
  return currentSessionId;
}

async function postAction<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  const body: Record<string, unknown> = { action, ...payload };
  if (currentSessionId && body.session_id === undefined) {
    body.session_id = currentSessionId;
  }
  const resp = await fetch(ORDERS_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (resp.status === 409) {
    throw new VersionConflictError(data.version || null);
  }
  if (resp.status === 423) {
    if (data && data.lock !== undefined) {
      throw new LockedByOtherError(data.lock || null, data.error);
    }
  }
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
  was_restored?: boolean;
  created_by?: string | null;
  qty_changed_by?: string | null;
  price_changed_by?: string | null;
  restored_by?: string | null;
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
  was_restored?: boolean;
  preserve_created_by?: string | null;
  preserve_qty_changed_by?: string | null;
  preserve_price_changed_by?: string | null;
}

export const orderApi = {
  createDraft: () => postAction<{ id: number; version: string }>("create_draft", {}),
  getVersion: (orderId: number) =>
    postAction<{ version: string }>("get_version", { order_id: orderId }),
  addItem: (orderId: number, item: ItemPayload, expectedVersion?: string | null) =>
    postAction<{ item: ServerOrderItem; total_amount: number; version: string }>(
      "add_item",
      { order_id: orderId, item: item as unknown as Record<string, unknown>, expected_version: expectedVersion ?? null }
    ),
  addItemsBatch: (orderId: number, items: ItemPayload[], expectedVersion?: string | null) =>
    postAction<{ items: ServerOrderItem[]; total_amount: number; version: string }>(
      "add_items_batch",
      { order_id: orderId, items: items as unknown as Record<string, unknown>[], expected_version: expectedVersion ?? null }
    ),
  updateItem: (itemId: number, fields: { quantity?: number; price?: number }, expectedVersion?: string | null) =>
    postAction<{ ok: boolean; amount: number; total_amount: number; version: string }>(
      "update_item",
      { item_id: itemId, ...fields, expected_version: expectedVersion ?? null }
    ),
  deleteItem: (itemId: number, expectedVersion?: string | null) =>
    postAction<{ ok: boolean; total_amount: number; version: string }>(
      "delete_item",
      { item_id: itemId, expected_version: expectedVersion ?? null }
    ),
  updateHeader: (orderId: number, fields: { customer_name?: string; comment?: string }, expectedVersion?: string | null) =>
    postAction<{ ok: boolean; version: string }>(
      "update_header",
      { order_id: orderId, ...fields, expected_version: expectedVersion ?? null }
    ),
  recalcZeroPrices: (orderId: number) =>
    postAction<{ updated: number; total_zero: number; total_amount: number; version: string; done: boolean; processed?: number }>(
      "recalc_zero_prices",
      { order_id: orderId }
    ),
  lock: (orderId: number, sessionId: string, force = false) =>
    postAction<{ ok: boolean; owner: 'self' | 'self_other_tab' | 'other'; lock: LockInfo; forced?: boolean }>(
      "lock",
      { order_id: orderId, session_id: sessionId, force }
    ),
  heartbeat: (orderId: number, sessionId: string) =>
    postAction<{ ok?: boolean; lost?: boolean; reason?: string }>(
      "heartbeat",
      { order_id: orderId, session_id: sessionId }
    ),
  unlock: (orderId: number, sessionId: string) =>
    postAction<{ ok: boolean; noop?: boolean }>(
      "unlock",
      { order_id: orderId, session_id: sessionId }
    ),
  forceUnlock: (orderId: number) =>
    postAction<{ ok: boolean }>(
      "force_unlock",
      { order_id: orderId }
    ),
};