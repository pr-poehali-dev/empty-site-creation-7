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
) => {
  let url = `${ODATA_URL}?action=${action}`;
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      url += `&${k}=${encodeURIComponent(v)}`;
    });
  }
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: method === "POST" ? JSON.stringify({ action, ...payload }) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Сервер вернул не JSON (код ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(data.error || `Ошибка запроса, код ${res.status}`);
  return data;
};

export const odataApi = {
  ping: () => call("ping"),
  refs: () => call("refs"),
  findProduct: (article: string) => call("find_product", "GET", undefined, { article }),
  createDoc: (kind: string, organizationKey?: string, warehouseKey?: string) =>
    call("create_doc", "POST", {
      kind,
      organization_key: organizationKey,
      warehouse_key: warehouseKey,
    }),
  createProduct: () => call("create_product", "POST"),
  remove: (entity: string, key: string, hard: boolean) =>
    call("delete", "POST", { entity, key, hard }),
};

export const DOC_KINDS = [
  { kind: "supplier_invoice", title: "Счёт на оплату поставщику", icon: "FileInput" },
  { kind: "goods_receipt", title: "Поступление товаров и услуг", icon: "PackagePlus" },
  { kind: "customer_invoice", title: "Счёт на оплату покупателю", icon: "FileOutput" },
  { kind: "goods_sale", title: "Реализация товаров и услуг", icon: "PackageMinus" },
];