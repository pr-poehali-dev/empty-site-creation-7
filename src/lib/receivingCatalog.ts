export const RECEIVING_CATALOG_URL =
  "https://functions.poehali.dev/4ec2e83b-a79c-4440-8933-04a6c73cd524";

export const FIELD_TITLES: Record<string, string> = {
  supplier_barcode: "Штрихкод поставщика",
  tech_name: "Техническое наименование",
  serial_number: "Серийный номер",
  declared_defect: "Заявленный дефект",
  brand: "Бренд",
  model: "Модель",
  product_group: "Товарная группа",
  direction: "Направление",
  order_number: "Заказ-наряд",
  supplier_code: "Код поставщика",
  weight_gross: "Вес брутто",
  weight_net: "Вес нетто",
  volume: "Объём",
  price: "Цена",
  has_package: "Упаковка",
  invoice_weight: "Вес по накладной",
  factory_barcode: "Заводской штрихкод",
  factory_barcode_2: "Заводской штрихкод 2",
  check_result: "Результат проверки",
  defect_confirmed: "Дефект подтверждён",
  new_defect: "Новый дефект",
  new_defect_text: "Описание нового дефекта",
  checked_by_name: "Кто проверил",
  checked_at: "Когда проверил",
  warehouse: "Склад",
};

export const GROUP_FIELDS = ["product_group", "brand", "model", "direction", "price"];

export const BOOL_FIELDS = ["has_package", "defect_confirmed", "new_defect"];

export const TECH_COLUMNS = [
  "supplier_barcode",
  "order_number",
  "tech_name",
  "brand",
  "model",
  "product_group",
  "direction",
  "serial_number",
  "declared_defect",
  "warehouse",
  "price",
];

export interface CatalogMeta {
  visible: string[];
  editable: string[];
  modes: { beauty: boolean; tech: boolean };
  directions: string[];
  brands: string[];
}

export interface GroupRow {
  name: string;
  product_group: string;
  brand: string;
  model: string;
  direction: string | null;
  price_min?: string | null;
  price_max?: string | null;
  qty: number;
}

export type ItemRow = Record<string, unknown> & { id: number };

export const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
};

export const priceLabel = (row: GroupRow) => {
  const lo = row.price_min == null ? null : Number(row.price_min);
  const hi = row.price_max == null ? null : Number(row.price_max);
  if (lo == null && hi == null) return "";
  if (lo == null || hi == null) return money(lo ?? hi);
  if (Math.abs(lo - hi) < 0.005) return money(lo);
  return `${money(lo)} – ${money(hi)}`;
};

export const cellText = (field: string, value: unknown) => {
  if (value == null || value === "") return "—";
  if (BOOL_FIELDS.includes(field)) return value ? "да" : "нет";
  if (field === "price") return money(value);
  return String(value);
};
