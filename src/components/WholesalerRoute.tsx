import { Navigate } from "react-router-dom";

export const WHOLESALER_ROLE = "Оптовик";

/** Роль текущего пользователя из сохранённых данных входа. */
export const getAuthUser = () => {
  try {
    return JSON.parse(localStorage.getItem("auth_user") || "{}");
  } catch {
    return {};
  }
};

export const isWholesaler = () => getAuthUser().role_name === WHOLESALER_ROLE;

/** Домашняя страница по должности. Используется кнопками «назад». */
export const homePath = () => {
  const user = getAuthUser();
  if (user.role === "owner") return "/admin/dashboard";
  if (user.role_name === WHOLESALER_ROLE) return "/wholesaler";
  return "/admin/manager";
};

/** Список инвентаризаций по должности. */
export const inventoriesPath = () =>
  isWholesaler() ? "/wholesaler/inventories" : "/admin/inventories";

/** Страница для всех, кроме оптовика: его уводим на свою страницу. */
export const NotForWholesaler = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/admin" replace />;
  if (isWholesaler()) return <Navigate to="/wholesaler" replace />;
  return <>{children}</>;
};

/** Страница оптовика. Владельца и управленцев тоже пускаем — им доступно всё. */
export const WholesalerRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

/** Страница только для оптовика — остальных возвращаем в их панель. */
export const OnlyWholesaler = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/admin" replace />;
  if (!isWholesaler()) {
    const user = getAuthUser();
    return <Navigate to={user.role === "owner" ? "/admin/dashboard" : "/admin/manager"} replace />;
  }
  return <>{children}</>;
};

export default WholesalerRoute;