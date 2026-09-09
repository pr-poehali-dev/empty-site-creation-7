export const INVENTORIES_URL = "https://functions.poehali.dev/01b573b5-2132-431d-952f-a2b55bd120ff";

export interface InventoryListItem {
  id: number;
  wholesaler_id: number;
  wholesaler_name: string;
  comment: string | null;
  total_amount: number;
  created_at: string | null;
  updated_at: string | null;
  items_count: number;
}

export interface InventoryItem {
  id: number;
  product_id: number;
  name: string;
  article: string | null;
  quantity: number;
  price: number;
  amount: number;
  price_is_manual?: boolean;
  price_source?: string | null;
  price_date?: string | null;
  sort_order?: number;
  created_by?: string | null;
  qty_changed_by?: string | null;
  price_changed_by?: string | null;
}

export interface Inventory {
  id: number;
  wholesaler_id: number;
  wholesaler_name: string;
  comment: string | null;
  total_amount: number;
  created_at: string | null;
  updated_at: string | null;
  items: InventoryItem[];
  can_edit_prices: boolean;
  can_delete: boolean;
  is_owner: boolean;
}

export interface WholesalerOption {
  id: number;
  name: string;
}

export interface ProductSearchItem {
  id: number;
  name: string;
  article: string | null;
  brand?: string | null;
  product_group?: string | null;
  price: number;
  price_source?: string | null;
  price_date?: string | null;
}

export const SEARCH_MODES = [
  { value: "all", label: "Все поля" },
  { value: "article", label: "Артикул" },
  { value: "supplier_code", label: "Код поставщика" },
] as const;
