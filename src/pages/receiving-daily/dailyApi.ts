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
  check_result: string | null;
  warehouse: string | null;
  checked_at: string | null;
  checked_by_name: string | null;
  daily_receiving_id: number | null;
}

export interface Receiving {
  id: number;
  manager_id: number | null;
  is_owner: boolean;
  employee_name: string;
  kind: string;
  work_date: string;
  closed: boolean;
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

export interface DailyState {
  found?: boolean;
  receiving: Receiving;
  counters: Counters;
  items: DailyItem[];
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

export const closeReceiving = (id: number) => post<{ ok: boolean }>({ action: "close", id });

export const scanCode = (code: string) =>
  get<{ found: boolean; item?: DailyItem; code?: string }>(
    `action=scan&code=${encodeURIComponent(code)}`
  );

export const searchItems = (q: string) =>
  get<{ rows: DailyItem[] }>(`action=search&q=${encodeURIComponent(q)}`);
