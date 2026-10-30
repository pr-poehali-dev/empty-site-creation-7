import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { findBase } from "./odata/bases";

const SECTIONS = [
  {
    path: "tests",
    title: "Тесты подключения",
    hint: "Связь, справочники, пробные документы",
    icon: "FlaskConical",
  },
  {
    path: "supplier-invoice",
    title: "Счёт на оплату поставщику",
    hint: "Загрузить файл OData и создать документ",
    icon: "FileInput",
  },
  {
    path: "goods-receipt",
    title: "Поступление товаров и услуг",
    hint: "Со страной, ГТД и РНПТ из файла",
    icon: "PackagePlus",
  },
  {
    path: "nomenclature",
    title: "Создание номенклатуры в 1С",
    hint: "Проверить счёт и завести новые товары",
    icon: "PackageSearch",
  },
  {
    path: "reconcile",
    title: "Сверка счёта с накладной",
    hint: "Реализация или поступление против счёта на оплату",
    icon: "GitCompareArrows",
  },
];

const OdataBase = () => {
  const navigate = useNavigate();
  const { base = "trade-resurs" } = useParams();
  const baseInfo = findBase(base);
  const sections = baseInfo?.kind === "unf" ? SECTIONS.filter((s) => s.path === "tests" || s.path === "nomenclature") : SECTIONS;
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");

  useEffect(() => {
    if (user.role !== "owner") navigate("/admin/dashboard");
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate("/admin/odata")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold leading-tight truncate">
              {baseInfo?.title || base}
            </h1>
            <p className="text-xs text-muted-foreground">Обмен с 1С OData</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-3">
        {sections.map((s) => (
          <button
            key={s.path}
            onClick={() => navigate(`/admin/odata/${base}/${s.path}`)}
            className="w-full text-left rounded-xl border border-white/[0.08] bg-card p-4 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Icon name={s.icon} size={20} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.title}</div>
                <div className="text-sm text-muted-foreground">{s.hint}</div>
              </div>
              <Icon name="ChevronRight" size={18} className="text-muted-foreground shrink-0" />
            </div>
          </button>
        ))}
      </main>
    </div>
  );
};

export default OdataBase;