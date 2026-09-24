import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Icon from "@/components/ui/icon";
import { useReceivingPerms } from "@/hooks/useReceivingPerms";
import PermissionsPanel from "@/components/receiving/PermissionsPanel";

const KINDS = [
  { key: "kind_plain", title: "Рабочий товар без проверки", icon: "PackageCheck" },
  { key: "kind_check", title: "Рабочий товар с проверкой", icon: "SearchCheck" },
  { key: "kind_repair", title: "Товар под ремонт", icon: "Wrench" },
];

const Receiving = () => {
  const navigate = useNavigate();
  const { perms, loading, can } = useReceivingPerms();
  const [screen, setScreen] = useState<"home" | "perms">("home");

  const kinds = KINDS.filter((k) => can(k.key));

  const actions = [
    {
      key: "manage_perms",
      icon: "Settings",
      label: "Настройки прав",
      onClick: () => setScreen("perms"),
    },
    {
      key: "upload_files",
      icon: "Upload",
      label: "Загрузка файла поставщика",
      onClick: () => navigate("/admin/receiving-upload"),
    },
    {
      key: "catalog_edit",
      icon: "BookOpen",
      label: "Каталог приёмки",
      onClick: () => navigate("/admin/receiving-catalog"),
    },
  ].filter((a) => can(a.key));

  const canCreate = kinds.length > 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (screen === "home" ? navigate("/admin/dashboard") : setScreen("home"))}
          >
            <Icon name="ArrowLeft" size={20} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">Приёмки</h1>
            {perms?.role_name && (
              <p className="text-xs text-muted-foreground truncate">{perms.role_name}</p>
            )}
          </div>

          {screen === "home" && (
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1">
                {actions.map((a) => (
                  <Tooltip key={a.key}>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={a.onClick}>
                        <Icon name={a.icon} size={20} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{a.label}</TooltipContent>
                  </Tooltip>
                ))}
                {canCreate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        className="rounded-xl"
                        onClick={() => navigate("/admin/receiving-daily")}
                      >
                        <Icon name="Plus" size={20} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Создать приёмку</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading && <p className="text-sm text-muted-foreground">Загружаю...</p>}

        {!loading && screen === "perms" && <PermissionsPanel onBack={() => setScreen("home")} />}

        {!loading && screen === "home" && (
          <>
            {kinds.length === 0 && actions.length === 0 ? (
              <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center">
                <Icon name="Lock" size={32} className="mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium mb-1">Доступ не выдан</p>
                <p className="text-sm text-muted-foreground">
                  Обратитесь к владельцу — он открывает разделы приёмки
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {kinds.map((k) => (
                  <button
                    key={k.key}
                    onClick={() => navigate(`/admin/receiving-daily?kind=${k.key}`)}
                    className="w-full rounded-xl border border-white/[0.08] bg-card p-4 flex items-center gap-4 text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="w-11 h-11 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                      <Icon name={k.icon} size={22} className="text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{k.title}</div>
                      <div className="text-xs text-muted-foreground">Начать или продолжить</div>
                    </div>
                    <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
                  </button>
                ))}

                {kinds.length === 0 && (
                  <div className="rounded-xl border border-white/[0.08] bg-card p-6 text-center text-sm text-muted-foreground">
                    Виды приёмки вам не открыты — доступны только кнопки в шапке
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Receiving;
