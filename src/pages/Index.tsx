import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    type TgWebApp = { initDataUnsafe?: { start_param?: string }; initData?: string };
    const redirectIfLot = () => {
      const tg = (window as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
      const startParam = tg?.initDataUnsafe?.start_param || "";
      if (/^lot_\d+$/.test(startParam)) {
        navigate("/tma", { replace: true });
        return true;
      }
      return false;
    };

    if (redirectIfLot()) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => redirectIfLot();
    document.body.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">Мир Техники плюс</h1>
      <p className="text-muted-foreground mb-6 text-center">Сайт в разработке</p>
      <Button
        onClick={() => navigate("/admin")}
        variant="outline"
        className="rounded-xl border-white/[0.08] hover:bg-white/[0.06]"
      >
        <Icon name="Lock" size={18} />
        <span className="ml-2">Панель управления</span>
      </Button>
    </div>
  );
};

export default Index;