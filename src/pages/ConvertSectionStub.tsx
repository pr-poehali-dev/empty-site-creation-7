import { useLocation } from "react-router-dom";
import Icon from "@/components/ui/icon";
import ConvertLayout from "./convert/ConvertLayout";
import { CONVERT_MENU, CONVERT_SECTIONS } from "./convert/convertSections";

const ConvertSectionStub = () => {
  const { pathname } = useLocation();
  const section = CONVERT_SECTIONS.find((s) => s.path === pathname);
  return (
    <ConvertLayout title={section?.title || "Конвертация"} back={CONVERT_MENU}>
      <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center">
        <Icon name={section?.icon || "FileCode"} size={32} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Раздел в разработке</p>
      </div>
    </ConvertLayout>
  );
};

export default ConvertSectionStub;
