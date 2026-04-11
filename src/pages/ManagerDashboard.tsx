import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/admin");
  };

  const displayName = user.first_name && user.last_name
    ? `${user.first_name} ${user.last_name}`
    : user.phone;

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

        <div className="flex gap-2 mb-5">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate("/admin/catalog")}
          >
            <Icon name="Package" size={20} />
            <span className="font-medium">Каталог</span>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ManagerDashboard;