import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import ConvertLayout from "./convert/ConvertLayout";
import { CONVERT_SECTIONS } from "./convert/convertSections";

const ConvertMenu = () => {
  const navigate = useNavigate();
  return (
    <ConvertLayout title="Конвертация файлов" back="/admin/dashboard">
      <div className="flex flex-col gap-3">
        {CONVERT_SECTIONS.map((s) => (
          <Button
            key={s.path}
            variant="outline"
            className="w-full h-12 rounded-xl border-white/[0.08] justify-start gap-3"
            onClick={() => navigate(s.path)}
          >
            <Icon name={s.icon} size={20} />
            <span className="font-medium">{s.title}</span>
          </Button>
        ))}
      </div>
    </ConvertLayout>
  );
};

export default ConvertMenu;
