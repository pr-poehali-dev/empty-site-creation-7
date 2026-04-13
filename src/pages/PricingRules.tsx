import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const PricingRules = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/dashboard")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Определение цен</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        <div className="text-center py-12">
          <Icon name="Calculator" size={48} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Здесь будут условия ценообразования для оптовиков</p>
          <p className="text-xs text-muted-foreground mt-2">Привязка ценовых правил к оптовым покупателям</p>
        </div>
      </main>
    </div>
  );
};

export default PricingRules;
