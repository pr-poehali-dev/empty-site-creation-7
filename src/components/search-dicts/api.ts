export const SEARCH_DICTS_URL = "https://functions.poehali.dev/10889013-8342-450f-9ef5-13a829420e6f";

export interface SearchBrand {
  id: number;
  name: string;
  aliases: string[];
  products: number;
}

export interface SearchGroup {
  id: number;
  name: string;
  products: number;
}

export type ParseStatus = "none" | "parsed" | "doubtful" | "manual";

export const PARSE_STATUS_LABELS: Record<ParseStatus, string> = {
  none: "Не разбирался",
  parsed: "Разобран",
  doubtful: "Сомнительно",
  manual: "Исправлен вручную",
};

export const PARSE_STATUS_COLORS: Record<ParseStatus, string> = {
  none: "bg-white/[0.06] text-muted-foreground border-white/[0.08]",
  parsed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  doubtful: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  manual: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

export const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

export async function loadSearchDicts(): Promise<{
  brands: SearchBrand[];
  groups: SearchGroup[];
  stats: Record<string, number>;
}> {
  const r = await fetch(SEARCH_DICTS_URL, { headers: authHeaders() });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Не удалось загрузить справочники");
  return { brands: d.brands || [], groups: d.groups || [], stats: d.stats || {} };
}

export async function callSearchDicts(
  method: "POST" | "PUT" | "DELETE",
  query: string,
  body?: unknown,
) {
  const r = await fetch(`${SEARCH_DICTS_URL}?${query}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка сохранения");
  return d;
}
