export const BARCODE_FIX_URL = "https://functions.poehali.dev/3acf6666-511e-4d8b-a467-b7e861f3b813";

const GTIN_LENGTHS = [8, 12, 13, 14];

/**
 * Контрольное число штрихкода EAN/UPC/GTIN.
 * ok — сходится, bad — точно ошибка в цифрах, na — такой код проверить нельзя.
 */
export const checksumState = (raw: string): "ok" | "bad" | "na" => {
  const code = raw.trim();
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.includes(code.length)) return "na";
  const body = code.slice(0, -1);
  const check = Number(code[code.length - 1]);
  let total = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    total += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (total % 10)) % 10 === check ? "ok" : "bad";
};

export const CHECKSUM_BAD_TEXT =
  "Штрихкод неверен: не совпадает контрольное число, проверьте цифры";

export interface CodeSummary {
  code: string;
  units: number;
  name: string;
  orders: string[];
  checksum: "ok" | "bad" | "na";
  distance?: number;
}

export interface SimilarResult {
  code: string;
  exists: boolean;
  checksum: "ok" | "bad" | "na";
  too_short: boolean;
  candidates: CodeSummary[];
}

export interface Position {
  product_group: string;
  brand: string;
  model: string;
  name?: string;
  units?: number;
  codes?: string[];
}

export interface SupplierLookup {
  found: boolean;
  code: string;
  item?: {
    id: number;
    name: string;
    tech_name: string;
    order_number: string | null;
    supplier_barcode: string | null;
    warehouse: string | null;
    factory_barcode: string;
    product_group: string;
    brand: string;
    model: string;
    codes: string[];
    units: number;
  };
  factory?: CodeSummary | null;
}

export interface CodeInfo {
  code: string;
  positions: (Position & { name: string; units: number; codes: string[] })[];
  checksum: "ok" | "bad" | "na";
}

export interface FixRow {
  id: number;
  old_code: string;
  new_code: string;
  units: number;
  source: string;
  fixed_by_name: string | null;
  fixed_at: string;
  reverted_at: string | null;
  reverted_by_name: string | null;
  from_pos?: Position[] | null;
  to_pos?: Position[] | null;
}

const headers = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

async function get<T>(query: string): Promise<T> {
  const r = await fetch(`${BARCODE_FIX_URL}?${query}`, { headers: headers() });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(BARCODE_FIX_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d as T;
}

export const findSimilar = (code: string) =>
  get<SimilarResult>(`action=similar&code=${encodeURIComponent(code.trim())}`);

export const lookupSupplier = (code: string, by: "supplier" | "order" | "any" = "supplier") =>
  get<SupplierLookup>(`action=by_supplier&by=${by}&code=${encodeURIComponent(code.trim())}`);

export const searchPositions = (q: string) =>
  get<{ rows: (Position & { name: string; units: number; codes: string[] })[] }>(
    `action=positions&q=${encodeURIComponent(q.trim())}`
  );

export const loadCodeInfo = (code: string) =>
  get<CodeInfo>(`action=code_info&code=${encodeURIComponent(code.trim())}`);

const posOnly = (p: Position) => ({
  product_group: p.product_group,
  brand: p.brand,
  model: p.model,
});

export const assignCode = (code: string, position: Position, moveFrom: Position[] = []) =>
  post<{ ok: boolean; already?: boolean; updated: number; moved_from?: number }>({
    action: "assign",
    code,
    position: posOnly(position),
    move_from: moveFrom.map(posOnly),
  });

export const samePosition = (a: Position, b: Position) =>
  a.product_group === b.product_group && a.brand === b.brand && a.model === b.model;

export const replaceCode = (old_code: string, new_code: string, source = "similar") =>
  post<{ ok: boolean; fix_id: number; updated: number }>({
    action: "replace",
    old_code,
    new_code,
    source,
  });

export const revertFix = (id: number) =>
  post<{ ok: boolean; restored: number }>({ action: "revert", id });

export const loadFixLog = (p: { from?: string; to?: string; who?: string } = {}) =>
  get<{ rows: FixRow[] }>(
    `action=log&from=${p.from || ""}&to=${p.to || ""}&who=${encodeURIComponent(p.who || "")}`
  );

export const loadSuspicious = () =>
  get<{ bad: CodeSummary[]; unchecked: CodeSummary[]; total_codes: number }>(
    "action=suspicious"
  );