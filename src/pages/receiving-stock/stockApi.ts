export const STOCK_URL = "https://functions.poehali.dev/410d241c-4a40-4286-b45a-93f8c8332a14";

export interface StockUnit {
  id: number;
  supplier_barcode: string;
  tech_name: string;
  serial_number: string | null;
  declared_defect: string | null;
  brand: string | null;
  model: string | null;
  factory_barcode: string | null;
  check_result: string | null;
  warehouse: string | null;
  checked_at: string | null;
  checked_by_name: string | null;
}

export interface StockGroup {
  name: string;
  product_group: string;
  brand: string;
  model: string;
  qty: number;
  factory_barcode: string | null;
  factory_variants: number;
}

export interface WarehouseTotal {
  name: string;
  qty: number;
}

export interface MoveRow {
  id: number;
  warehouse_from: string | null;
  warehouse_to: string;
  moved_by_name: string | null;
  moved_at: string;
}

export interface MoveResult {
  ok: boolean;
  moved: number;
  skipped: number;
  move_ids: number[];
  warehouse_to: string;
}

const headers = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

async function get<T>(query: string): Promise<T> {
  const r = await fetch(`${STOCK_URL}?${query}`, { headers: headers() });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(STOCK_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

export const loadWarehouses = () =>
  get<{ warehouses: { key: string; name: string }[] }>("action=meta");

export const loadTotals = () => get<{ totals: WarehouseTotal[] }>("action=totals");

export const loadGroups = (warehouse: string, q = "") =>
  get<{ rows: StockGroup[]; warehouse: string }>(
    `action=groups&warehouse=${encodeURIComponent(warehouse)}&q=${encodeURIComponent(q)}`
  );

export const loadUnits = (warehouse: string, group: StockGroup, q = "") =>
  get<{ rows: StockUnit[] }>(
    `action=units&warehouse=${encodeURIComponent(warehouse)}` +
      `&product_group=${encodeURIComponent(group.product_group)}` +
      `&brand=${encodeURIComponent(group.brand)}` +
      `&model=${encodeURIComponent(group.model)}` +
      `&q=${encodeURIComponent(q)}`
  );

export const findByCode = (code: string) =>
  get<{ found: boolean; item?: StockUnit; code?: string; reason?: string }>(
    `action=find&code=${encodeURIComponent(code)}`
  );

export const loadHistory = (itemId: number) =>
  get<{ moves: MoveRow[]; check: Record<string, unknown> | null }>(
    `action=history&item_id=${itemId}`
  );

export const moveItems = (itemIds: number[], warehouseTo: string) =>
  post<MoveResult>({ action: "move", item_ids: itemIds, warehouse_to: warehouseTo });

export const undoMove = (moveIds: number[]) =>
  post<{ ok: boolean; restored: number; kept: number }>({
    action: "undo_move",
    move_ids: moveIds,
  });