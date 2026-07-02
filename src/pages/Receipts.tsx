import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import DebugBadge from "@/components/DebugBadge";

const Receipts = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";

  const goBack = () => {
    if (isOwner) navigate("/admin/dashboard");
    else navigate("/admin/manager");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goBack}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold">Приёмки</h1>
          </div>
          <DebugBadge id="Receipts:createBtn">
            <Button className="h-9" onClick={() => {}}>
              <Icon name="Plus" size={16} />
              <span className="ml-1 hidden sm:inline">Создать приёмку</span>
              <span className="ml-1 sm:hidden">Создать</span>
            </Button>
          </DebugBadge>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <div className="text-center py-12">
          <Icon name="PackagePlus" size={48} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Здесь будут приёмки товаров</p>
        </div>
      </main>
    </div>
  );
};

export default Receipts;
