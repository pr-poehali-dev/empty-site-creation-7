import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import DebugToggle from "@/components/DebugToggle";
import DebugBadge from "@/components/DebugBadge";
import { useReceivingPerms } from "@/hooks/useReceivingPerms";
import { RECEIVING_ROLE } from "@/components/WholesalerRoute";

/** Любое из этих прав означает, что человеку есть что делать в приёмке. */
const RECEIVING_KEYS = [
  "kind_plain",
  "kind_check",
  "kind_repair",
  "wh_sgp",
  "wh_wipe",
  "wh_repair",
  "wh_scrap",
  "upload_files",
  "catalog_edit",
  "manage_perms",
];

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  // Вход в приёмку даётся по правам, а не по должности: выдали право —
  // кнопка появилась. Без этого права были, а войти было некуда.
  const { can } = useReceivingPerms();
  // Роль «Приёмка» — одна кнопка всегда; без прав внутри будет «Доступ не выдан».
  const receivingOnly = user.role_name === RECEIVING_ROLE;
  const canSeeReceiving = receivingOnly || RECEIVING_KEYS.some((k) => can(k));

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/admin");
  };

  const displayName = user.first_name && user.last_name
    ? `${user.first_name} ${user.last_name}`
    : user.phone;

  const canSeeOrders = ["Управляющий", "Менеджер опта"].includes(user.role_name);
  const canSeeCommon = !receivingOnly;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <h1 className="text-lg sm:text-xl font-semibold">Мир Техники плюс</h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user.role_name}</p>
            </div>
            <DebugToggle />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 hover:bg-white/[0.06]"
              onClick={handleLogout}
            >
              <Icon name="LogOut" size={16} />
              <span className="ml-2 hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="mb-5 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold">Панель управления</h2>
          {user.role_name && (
            <Badge className="mt-2 bg-white/[0.06] text-muted-foreground border-white/[0.08]">{user.role_name}</Badge>
          )}
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          {canSeeReceiving && (
            <DebugBadge id="Manager:nav.receipts" className="flex-1">
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
                onClick={() => navigate("/admin/receipts")}
              >
                <Icon name="PackageCheck" size={20} />
                <span className="font-medium">Приёмка</span>
              </Button>
            </DebugBadge>
          )}
          {canSeeCommon && (
            <DebugBadge id="Manager:nav.catalog" className="flex-1">
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
                onClick={() => navigate("/admin/catalog")}
              >
                <Icon name="Package" size={20} />
                <span className="font-medium">Каталог</span>
              </Button>
            </DebugBadge>
          )}
          {canSeeOrders && (
            <DebugBadge id="Manager:nav.orders" className="flex-1">
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
                onClick={() => navigate("/admin/orders")}
              >
                <Icon name="ClipboardList" size={20} />
                <span className="font-medium">Заявки</span>
              </Button>
            </DebugBadge>
          )}
          {canSeeOrders && (
            <DebugBadge id="Manager:nav.returns" className="flex-1">
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
                onClick={() => navigate("/admin/returns")}
              >
                <Icon name="Undo2" size={20} />
                <span className="font-medium">Возвраты</span>
              </Button>
            </DebugBadge>
          )}
          {canSeeOrders && (
            <DebugBadge id="Manager:nav.inventories" className="flex-1">
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
                onClick={() => navigate("/admin/inventories")}
              >
                <Icon name="ClipboardCheck" size={20} />
                <span className="font-medium">Инвентаризации</span>
              </Button>
            </DebugBadge>
          )}
          {canSeeCommon && (
            <DebugBadge id="Manager:nav.labels" className="flex-1">
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
                onClick={() => navigate("/admin/labels")}
              >
                <Icon name="Tag" size={20} />
                <span className="font-medium">Этикетки</span>
              </Button>
            </DebugBadge>
          )}
        </div>
      </main>
    </div>
  );
};

export default ManagerDashboard;