export const ORDERS_URL = "https://functions.poehali.dev/367c1ff5-e6fd-4901-8e79-6255d6893aed";

export interface Order {
  id: number;
  customer_name: string;
  comment: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  created_by: string;
  payment_status: string;
  paid_amount: number;
  is_restored: boolean;
}

export interface OrderLine {
  product_id: number;
  name: string;
  article: string | null;
  quantity: number;
  price: number;
}

export const statusLabels: Record<string, { label: string; className: string }> = {
  new: { label: "Новая", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  confirmed: { label: "Подтверждена", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  shipped: { label: "Отгружена", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  completed: { label: "Завершена", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  archived: { label: "Архив", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

export const paymentStatusLabels: Record<string, { label: string; className: string }> = {
  not_paid: { label: "Не оплачена", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  partially_paid: { label: "Частично", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  paid: { label: "Оплачена", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

export const NEXT_STATUS: Record<string, { status: string; label: string; icon: string }> = {
  new: { status: "confirmed", label: "Подтвердить", icon: "CheckCircle" },
  confirmed: { status: "shipped", label: "Отгружена", icon: "Truck" },
};
