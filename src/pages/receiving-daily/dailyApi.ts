export const DAILY_URL = "https://functions.poehali.dev/afeafd1b-f066-4048-8588-e5879958220e";

export interface DailyItem {
  id: number;
  supplier_barcode: string;
  tech_name: string;
  serial_number: string | null;
  declared_defect: string | null;
  brand: string | null;
  model: string | null;
  product_group: string | null;
  direction: string | null;
  order_number: string | null;
  supplier_code: string | null;
  weight_gross: number | null;
  weight_net: number | null;
  has_package: boolean | null;
  invoice_weight: number | null;
  factory_barcode: string | null;
  defect_confirmed: boolean | null;
  new_defect: boolean | null;
  new_defect_text: string | null;
  check_result: string | null;
  warehouse: string | null;
  checked_at: string | null;
  checked_by_name: string | null;
  daily_receiving_id: number | null;
}

export type Outcome = "sale" | "wipe" | "repair" | "scrap";

export const KIND_TITLES: Record<string, string> = {
  kind_plain: "Рабочий товар без проверки",
  kind_check: "Рабочий товар с проверкой",
  kind_repair: "Товар под ремонт",
};

export const KIND_SHORT: Record<string, string> = {
  kind_plain: "Без проверки",
  kind_check: "С проверкой",
  kind_repair: "Под ремонт",
};

export interface CheckPayload {
  item_id: number;
  receiving_id: number;
  outcome: Outcome;
  has_package?: boolean;
  defect_confirmed?: boolean;
  new_defect?: boolean;
  new_defect_text?: string;
}

export interface Receiving {
  id: number;
  manager_id: number | null;
  is_owner: boolean;
  employee_name: string;
  kind: string;
  work_date: string;
  closed: boolean;
  /** Закрыл не мастер, а система: сутки кончились, кнопку не нажали. */
  auto_closed?: boolean;
  opened_at: string;
  closed_at: string | null;
}

export interface Counters {
  sale: number;
  wipe: number;
  repair: number;
  scrap: number;
  total: number;
}

export interface ReceivingRow extends Receiving {
  qty: number;
  counters?: Counters;
  /** Сервер уже учёл: своя, закрыта и пустая. */
  can_delete?: boolean;
}

export interface ListFilter {
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  mine?: boolean;
  kind?: string;
  excludeId?: number;
  closedOnly?: boolean;
  limit?: number;
  offset?: number;
}

/** Отбор идёт по всей базе, наружу выдаётся порциями. */
export const loadReceivings = (f: ListFilter = {}) => {
  // Дата с телефона: по ней сервер закроет забытые приёмки прошлых дней.
  const p = new URLSearchParams({ action: "list", today: todayLocal() });
  if (f.dateFrom) p.set("date_from", f.dateFrom);
  if (f.dateTo) p.set("date_to", f.dateTo);
  if (f.q) p.set("q", f.q);
  if (f.mine) p.set("mine", "1");
  if (f.kind) p.set("kind", f.kind);
  if (f.excludeId) p.set("exclude", String(f.excludeId));
  if (f.closedOnly) p.set("closed_only", "1");
  p.set("limit", String(f.limit ?? 5));
  p.set("offset", String(f.offset ?? 0));
  return get<{ rows: ReceivingRow[]; total: number; see_all: boolean }>(p.toString());
};

export interface DailyState {
  found?: boolean;
  receiving: Receiving;
  counters: Counters;
  items: DailyItem[];
  /** Своя ли приёмка — пустую закрытую можно удалить. */
  can_delete?: boolean;
}

const headers = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

async function get<T>(query: string): Promise<T> {
  const r = await fetch(`${DAILY_URL}?${query}`, { headers: headers() });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(DAILY_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

/** Дата рабочего дня берётся с телефона сотрудника — у каждого свой часовой пояс. */
export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const findCurrent = (kind: string) =>
  get<DailyState & { found: boolean }>(
    `action=current&kind=${encodeURIComponent(kind)}&work_date=${todayLocal()}`
  );

export const openReceiving = (kind: string) =>
  post<Receiving>({ action: "open", kind, work_date: todayLocal() });

export const loadState = (id: number) => get<DailyState>(`action=state&id=${id}`);

/** Просмотр закрытой приёмки: список целиком, с отбором по товару. */
export const loadArchive = (id: number, q = "") =>
  get<DailyState>(`action=state&id=${id}&limit=500&q=${encodeURIComponent(q)}`);

export const closeReceiving = (id: number) => post<{ ok: boolean }>({ action: "close", id });

/** Удалить можно только пустую закрытую и только свою — решает сервер. */
export const deleteReceiving = (id: number) =>
  post<{ ok: boolean; deleted: number }>({ action: "delete", id });

export const scanCode = (code: string) =>
  get<{ found: boolean; item?: DailyItem; code?: string }>(
    `action=scan&code=${encodeURIComponent(code)}`
  );

export const saveCheck = (payload: CheckPayload) =>
  post<{ ok: boolean; counters: Counters }>({ action: "check", ...payload });

export const saveFactoryCode = (item_id: number, code: string) =>
  post<{ ok: boolean; updated: number; tech_name: string }>({
    action: "factory",
    item_id,
    code,
  });

export const undoCheck = (item_id: number, receiving_id: number) =>
  post<{ ok: boolean; counters: Counters }>({ action: "undo", item_id, receiving_id });

/** Убрать позицию из приёмки: результат снимается, товар уходит в общий пул. */
export const removeItem = (item_id: number, receiving_id: number) =>
  post<{ ok: boolean; counters: Counters }>({
    action: "item_remove",
    item_id,
    receiving_id,
  });

export const searchItems = (q: string) =>
  get<{ rows: DailyItem[] }>(`action=search&q=${encodeURIComponent(q)}`);