export const COUNTERPARTIES_URL = "https://functions.poehali.dev/3ccbeed0-2b77-46f0-a459-90e137d09bd3";

export interface Counterparty {
  id: number;
  name: string;
  inn: string | null;
  phone: string | null;
  contact: string | null;
  comment: string | null;
  is_archived: boolean;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export type CounterpartyForm = {
  id?: number;
  name: string;
  inn: string;
  phone: string;
  contact: string;
  comment: string;
};

const headers = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

async function get<T>(query: string): Promise<T> {
  const r = await fetch(`${COUNTERPARTIES_URL}?${query}`, { headers: headers() });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(COUNTERPARTIES_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

export const loadCpMeta = () => get<{ can_see: boolean; can_edit: boolean }>("action=meta");

export const loadCounterparties = (q = "", archived = false) =>
  get<{ rows: Counterparty[] }>(
    `action=list&q=${encodeURIComponent(q.trim())}&archived=${archived ? 1 : 0}`
  );

export const saveCounterparty = (form: CounterpartyForm, force = false) =>
  post<{
    ok?: boolean;
    row?: Counterparty;
    duplicate?: { id: number; name: string; inn: string | null };
  }>({ action: "save", ...form, force });

export const archiveCounterparty = (id: number, archived: boolean) =>
  post<{ ok: boolean }>({ action: "archive", id, archived });
