import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <h1 className="text-3xl font-bold mb-2">Мир Техники плюс</h1>
      <p className="text-muted-foreground mb-6">Сайт в разработке</p>
      <Button onClick={() => navigate("/admin")} variant="outline">
        <Icon name="Lock" size={18} />
        <span className="ml-2">Панель управления</span>
      </Button>
    </div>
  );
};

export default Index;
