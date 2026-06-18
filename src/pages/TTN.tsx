import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const TTN = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-white/[0.06]"
              onClick={() => navigate("/admin/dashboard")}
            >
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg sm:text-xl font-semibold">Создание ТТН</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-white/[0.08] gap-2"
            onClick={() => navigate("/admin/ttn/settings")}
          >
            <Icon name="Settings" size={16} />
            <span className="hidden sm:inline">Настройки создания ТТН</span>
            <span className="sm:hidden">Настройки</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center">
          <Icon name="FileText" size={40} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">
            Здесь будет создание ТТН. Сначала загрузите образец и настройте шаблон в разделе
            «Настройки создания ТТН».
          </p>
        </div>
      </main>
    </div>
  );
};

export default TTN;
