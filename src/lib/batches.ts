export const BATCHES_URL = "https://functions.poehali.dev/2bb77762-8351-43e7-a1bb-f0da8f8a9b5e";

export interface BatchRow {
  id: number;
  number: string | null;
  status: string;
  warehouse: string | null;
  mixed: boolean;
  created_by_name: string;
  created_by_user: number;
  created_at: string;
  updated_at: string;
  counterparty: string | null;
  qty: number;
}

export interface BatchItem {
  id: number;
  name: string;
  tech_name: string;
  supplier_barcode: string | null;
  order_number: string | null;
  warehouse: string | null;
  product_group: string;
  brand: string;
  model: string;
  kind: "exact" | "auto";
  added_at: string;
  added_by_name?: string | null;
}

export interface BatchView {
  batch: {
    id: number;
    number: string | null;
    status: string;
    warehouse: string | null;
    mixed: boolean;
    comment: string | null;
    created_by_name: string;
    created_by_user: number;
    created_at: string;
    updated_at: string;
    counterparty: { id: number; name: string; inn: string | null } | null;
    public_key: string | null;
    code: string;
    finished_at: string | null;
    finished_by_name: string | null;
    closed_at: string | null;
    closed_by_name: string | null;
  };
  items: BatchItem[];
  can_edit: boolean;
  can_finish: boolean;
  can_disband: boolean;
  can_print: boolean;
  summary: BatchSummary;
}

export interface BatchSummary {
  total: number;
  exact: number;
  auto: number;
  warehouses: string[];
  mixed: boolean;
}

export interface BatchMeta {
  can_see: boolean;
  can_build: boolean;
  can_change: boolean;
  can_disband: boolean;
  can_print: boolean;
  user_id: number;
  is_owner: boolean;
}

export interface LogRow {
  id: number;
  action: string;
  title: string;
  item_id: number | null;
  details: Record<string, unknown> | null;
  by_name: string;
  at: string;
  tech_name: string | null;
  supplier_barcode: string | null;
}

export const STATUS_TITLE: Record<string, string> = {
  draft: "Черновик",
  done: "Собрана",
  disbanded: "Разобрана",
  sold: "Продана",
  written_off: "Списана",
};

export const publicLink = (key: string) => `${window.location.origin}/b/${key}`;

/** Наклейка партии: штрихкод P000123 или ссылка из QR. */
export const parseBatchCode = (code: string): { id?: number; key?: string } | null => {
  const c = code.trim();
  const m = /^P(\d{6})$/i.exec(c);
  if (m) return { id: Number(m[1]) };
  const k = /\/b\/([A-Za-z0-9_-]{10,})/.exec(c);
  if (k) return { key: k[1] };
  return null;
};

export interface PosRef {
  product_group: string;
  brand: string;
  model: string;
  name: string;
}

export interface StockRef {
  name: string;
  free: number;
}

export interface ScanResult {
  ok?: boolean;
  flash?: number;
  message?: string | null;
  error?: string;
  investigate?: boolean;
  need?: "other_wh" | "pick_warehouse" | "pick_position" | "unknown_code" | "pick_remove";
  from_wh?: string | null;
  batch_wh?: string;
  can_move?: boolean;
  stock?: StockRef[];
  allowed?: string[];
  position?: PosRef;
  positions?: (PosRef & { free: number })[];
  code?: string;
  rows?: BatchItem[];
  removed?: number;
  can_mix?: boolean;
  batch_ref?: boolean;
}

export interface ScanOptions {
  on_other?: "mix" | "move";
  warehouse?: string;
  position?: Omit<PosRef, "name">;
}

const headers = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

async function get<T>(query: string): Promise<T> {
  const r = await fetch(`${BATCHES_URL}?${query}`, { headers: headers() });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(BATCHES_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

export const loadBatchMeta = () => get<BatchMeta>("action=meta");

export interface BatchCounts {
  done: number;
  drafts: number;
}

export const loadBatches = () =>
  get<{ drafts: BatchRow[]; batches: BatchRow[]; counts: BatchCounts }>("action=list");

export const loadBatchCounts = () => get<BatchCounts>("action=counts");

export const newBatch = () => post<{ id: number; created: boolean }>({ action: "new" });

export const loadBatch = (id: number) => get<BatchView>(`action=get&id=${id}`);

export const scanToBatch = (id: number, code: string, opts: ScanOptions = {}) =>
  post<ScanResult>({ action: "scan", id, code, ...opts });

export const removeScan = (id: number, code: string) =>
  post<ScanResult>({ action: "remove_scan", id, code });

export const removeItem = (id: number, item_id: number) =>
  post<ScanResult>({ action: "remove_item", id, item_id });

export const setBatchMeta = (
  id: number,
  meta: { comment?: string; counterparty_id?: number | null }
) => post<{ ok?: boolean; error?: string }>({ action: "set_meta", id, ...meta });

export const deleteBatch = (id: number) =>
  post<{ ok?: boolean; error?: string; freed?: number }>({ action: "delete", id });

export const finishBatch = (id: number) =>
  post<{ ok?: boolean; error?: string; number?: string }>({ action: "finish", id });

export const disbandBatch = (id: number) =>
  post<{ ok?: boolean; error?: string; freed?: number }>({ action: "disband", id });

export const loadBatchLog = (id: number) => get<{ rows: LogRow[] }>(`action=log&id=${id}`);

export const takeFind = (id: number, code: string) =>
  post<{ ok?: boolean; error?: string; rows?: BatchItem[]; exact?: boolean }>({
    action: "take_find",
    id,
    code,
  });

export const takeItems = (
  id: number,
  item_ids: number[],
  dest: "draft" | "move",
  warehouse_to?: string
) =>
  post<{
    ok?: boolean;
    error?: string;
    taken?: number;
    moved?: number;
    draft_id?: number;
    draft_created?: boolean;
    draft_mixed?: boolean;
  }>({ action: "take", id, item_ids, dest, warehouse_to });

export const findBatch = (q: string) =>
  get<{ found: boolean; id?: number; number?: string }>(`action=find&q=${encodeURIComponent(q)}`);

/** Код с наклейки партии → id партии, или null если это не наклейка партии. */
export const resolveBatchCode = async (code: string): Promise<number | null> => {
  if (!parseBatchCode(code) && !/^\d{6}\/\d+\/.+/.test(code.trim())) return null;
  const r = await findBatch(code.trim());
  return r.found && r.id ? r.id : null;
};

export interface SavedLabelSize {
  id: number;
  name: string;
  w: number;
  h: number;
}

export const loadLabelSizes = () => get<{ sizes: SavedLabelSize[] }>("action=label_sizes");

export const addLabelSize = (name: string, w: number, h: number) =>
  post<{ id: number }>({ action: "label_size_add", name, w, h });

export const deleteLabelSize = (size_id: number) =>
  post<{ ok: boolean }>({ action: "label_size_del", size_id });
