import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Мир Техники плюс</h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user.role_name}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <Icon name="LogOut" size={16} />
              <span className="ml-2">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">Панель управления</h2>
          {user.role_name && (
            <Badge className="mt-2" variant="secondary">{user.role_name}</Badge>
          )}
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Icon name="Construction" size={48} className="text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Раздел в разработке</p>
            <p className="text-sm text-muted-foreground mt-1">Скоро здесь появится функционал для вашей роли</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ManagerDashboard;
