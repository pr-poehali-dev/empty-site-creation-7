import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { findBase } from "./odata/bases";

const STEPS = [
  {
    icon: "FileUp",
    title: "Загрузка счёта",
    hint: "Excel или PDF поставщика — сайт покажет найденные товары",
  },
  {
    icon: "Search",
    title: "Проверка в 1С",
    hint: "Поиск по артикулу, штрихкоду или наименованию: есть, несколько, нет",
  },
  {
    icon: "ClipboardList",
    title: "Заполнение новых позиций",
    hint: "Группа, базовая цена, вес в кг, код ТНВЭД по похожим товарам",
  },
  {
    icon: "PackagePlus",
    title: "Создание в 1С",
    hint: "Карточка, штрихкод и базовая цена по каждой позиции",
  },
  {
    icon: "FileSpreadsheet",
    title: "Excel для других баз",
    hint: "Только новые позиции, FIFO и «Без НДС»",
  },
];

const OdataNomenclature = () => {
  const navigate = useNavigate();
  const { base = "trade-resurs" } = useParams();
  const baseInfo = findBase(base);
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
            onClick={() => navigate(`/admin/odata/${base}`)}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold leading-tight truncate">
              Создание номенклатуры в 1С
            </h1>
            <p className="text-xs text-muted-foreground">{baseInfo?.title || base}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-3">
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
          Страница в разработке. Шаги появятся по очереди.
        </div>
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className="rounded-xl border border-white/[0.08] bg-card p-4 flex items-center gap-3 opacity-70"
          >
            <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
              <Icon name={s.icon} size={20} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {i + 1}. {s.title}
              </div>
              <div className="text-sm text-muted-foreground">{s.hint}</div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">скоро</span>
          </div>
        ))}
      </main>
    </div>
  );
};

export default OdataNomenclature;
