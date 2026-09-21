const ODATA_URL = "https://functions.poehali.dev/74601b0f-9a91-4dbb-aef5-3cf2cadf93c8";

export interface RefItem {
  key: string;
  name: string;
}

export interface FoundProduct {
  key: string;
  code: string;
  name: string;
  article: string;
  deleted: boolean;
}

export interface CreatedObject {
  ok: boolean;
  entity?: string;
  key?: string;
  number?: string;
  name?: string;
  date?: string;
  posted?: boolean;
  error?: string;
  sent?: Record<string, unknown>;
  lines?: number;
  amount?: number;
  used?: {
    number_field?: string;
    date_field?: string;
    fallback?: string;
    table?: string;
    columns?: string[];
    vat_rate?: string;
    vat_amount?: number;
    vat_in_sum_field?: string;
    vat_in_sum_warning?: string;
    amount_warning?: string;
    notes?: string[];
  };
  sent_line?: Record<string, unknown>;
}

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

const call = async (
  action: string,
  method: "GET" | "POST" = "GET",
  payload?: object,
  query?: Record<string, string>,
  base?: string,
) => {
  let url = `${ODATA_URL}?action=${action}`;
  if (base) url += `&base=${encodeURIComponent(base)}`;
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      url += `&${k}=${encodeURIComponent(v)}`;
    });
  }
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body:
      method === "POST" ? JSON.stringify({ action, base, ...payload }) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Сервер вернул не JSON (код ${res.status}): ${text.slice(0, 300)}`);
  }
  if (res.status === 504) {
    throw new Error(
      "1С не успела ответить за отведённое время. Документ мог частично создаться — проверьте в 1С перед повторной попыткой.",
    );
  }
  if (!res.ok) throw new Error(data.error || `Ошибка запроса, код ${res.status}`);
  return data;
};

export const odataApi = {
  bases: () => call("bases"),
  ping: (base: string) => call("ping", "GET", undefined, undefined, base),
  refs: (base: string) => call("refs", "GET", undefined, undefined, base),
  findProduct: (base: string, article: string) =>
    call("find_product", "GET", undefined, { article }, base),
  createDoc: (
    base: string,
    kind: string,
    organizationKey?: string,
    warehouseKey?: string,
  ) =>
    call(
      "create_doc",
      "POST",
      {
        kind,
        organization_key: organizationKey,
        warehouse_key: warehouseKey,
      },
      undefined,
      base,
    ),
  matchProducts: (base: string, rows: { article: string }[]) =>
    call("match_products", "POST", { rows }, undefined, base),
  gtdSchema: (base: string) => call("gtd_schema", "POST", {}, undefined, base),
  repairGtd: (base: string) => call("repair_gtd", "POST", {}, undefined, base),
  checkGtd: (base: string, numbers: string[]) =>
    call("check_gtd", "POST", { numbers }, undefined, base),
  createGtd: (base: string, numbers: string[]) =>
    call("create_gtd", "POST", { numbers }, undefined, base),
  tryCreateOneGtd: (base: string, numbers: string[]) =>
    call("try_create_one_gtd", "POST", { numbers }, undefined, base),
  createSupplierInvoice: (base: string, payload: DocPayload) =>
    call("create_supplier_invoice", "POST", payload, undefined, base),
  createGoodsReceipt: (base: string, payload: DocPayload) =>
    call("create_goods_receipt", "POST", payload, undefined, base),
  createProduct: (base: string) =>
    call("create_product", "POST", undefined, undefined, base),
  remove: (base: string, entity: string, key: string, hard: boolean) =>
    call("delete", "POST", { entity, key, hard }, undefined, base),
};

export interface DocPayload {
  organization_key?: string;
  warehouse_key?: string;
  date?: string;
  incoming_number?: string;
  incoming_date?: string;
  vat_rate?: string;
  comment?: string;
  rows: {
    key: string;
    article: string;
    quantity: number;
    price: number;
    country?: string;
    gtd?: string;
    rnpt?: string;
  }[];
}

export const VAT_RATES = [
  { value: "22", label: "22%" },
  { value: "10", label: "10%" },
  { value: "5", label: "5%" },
  { value: "0", label: "0%" },
  { value: "none", label: "Без НДС" },
];

export const DOC_KINDS = [
  { kind: "supplier_invoice", title: "Счёт на оплату поставщику", icon: "FileInput" },
  { kind: "goods_receipt", title: "Поступление товаров и услуг", icon: "PackagePlus" },
  { kind: "customer_invoice", title: "Счёт на оплату покупателю", icon: "FileOutput" },
  { kind: "goods_sale", title: "Реализация товаров и услуг", icon: "PackageMinus" },
];