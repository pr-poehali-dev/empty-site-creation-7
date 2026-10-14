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
import DebugBadge from "@/components/DebugBadge";
import { useReceivingPerms } from "@/hooks/useReceivingPerms";
import PermissionsPanel from "@/components/receiving/PermissionsPanel";

const KINDS = [
  { key: "kind_plain", title: "Рабочий товар без проверки", icon: "PackageCheck" },
  { key: "kind_check", title: "Рабочий товар с проверкой", icon: "SearchCheck" },
  { key: "kind_repair", title: "Товар под ремонт", icon: "Wrench" },
];

const WAREHOUSE_KEYS = ["wh_sgp", "wh_wipe", "wh_repair", "wh_scrap"];

const ACTIONS = [
  { key: "_list", icon: "ClipboardList", label: "Список приёмок" },
  { key: "manage_perms", icon: "Settings", label: "Настройки прав" },
  { key: "upload_files", icon: "Upload", label: "Загрузка файла поставщика" },
  { key: "catalog_edit", icon: "BookOpen", label: "Каталог приёмки" },
  { key: "_stock", icon: "Warehouse", label: "Склады и остатки" },
  { key: "_barcodes", icon: "ScanBarcode", label: "Контроль штрихкодов" },
  { key: "_counterparties", icon: "Users", label: "Контрагенты" },
  { key: "report_summary", icon: "FileBarChart", label: "Отчёты" },
];

const Receipts = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";
  const { perms, loading, can, expired } = useReceivingPerms();
  const [screen, setScreen] = useState<"home" | "perms">("home");

  const hasStock = WAREHOUSE_KEYS.some((k) => can(k));
  const myKinds = KINDS.filter((k) => can(k.key));
  // Список приёмок: мастеру с видом — свои, по праву see_all_lists — все,
  // даже без выданных видов (только смотреть). Отбор решает сервер.
  const canList = myKinds.length > 0 || can("see_all_lists");
  const myActions = ACTIONS.filter((a) =>
    a.key === "_stock"
      ? hasStock
      : a.key === "_list"
        ? canList
        : a.key === "_barcodes"
          ? isOwner
          : a.key === "_counterparties"
            ? can("cp_see") || can("cp_edit")
            : can(a.key)
  );
  const goBack = () => {
    if (screen !== "home") {
      setScreen("home");
      return;
    }
    navigate(isOwner ? "/admin/dashboard" : "/admin/manager");
  };

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="LogIn" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium mb-1">Войдите заново</p>
          <p className="text-sm text-muted-foreground mb-4">Срок входа истёк</p>
          <Button onClick={() => navigate("/admin")}>Войти</Button>
        </div>
      </div>
    );
  }

  const kinds = myKinds;

  const actions = myActions.map((a) => ({
    ...a,
    onClick: () => {
      if (a.key === "_list") return navigate("/admin/receiving-list");
      if (a.key === "manage_perms") return setScreen("perms");
      if (a.key === "upload_files") return navigate("/admin/receiving-upload");
      if (a.key === "_stock") return navigate("/admin/receiving-stock");
      if (a.key === "_barcodes") return navigate("/admin/barcode-control");
      if (a.key === "_counterparties") return navigate("/admin/receiving-counterparties");
      if (a.key === "report_summary") return navigate("/admin/receiving-reports");
      return navigate("/admin/receiving-catalog");
    },
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goBack}>
            <Icon name="ArrowLeft" size={18} />
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={a.onClick}
                      >
                        <Icon name={a.icon} size={18} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{a.label}</TooltipContent>
                  </Tooltip>
                ))}
                {kinds.length > 0 && (
                  <DebugBadge id="Receipts:createBtn">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-9 w-9 p-0"
                          onClick={() =>
                            navigate(`/admin/receiving-daily?kind=${kinds[0].key}`)
                          }
                        >
                          <Icon name="Plus" size={18} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Создать приёмку</TooltipContent>
                    </Tooltip>
                  </DebugBadge>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
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
            ) : kinds.length === 0 && canList ? (
              <button
                onClick={() => navigate("/admin/receiving-list")}
                className="w-full rounded-xl border border-white/[0.08] bg-card p-4 flex items-center gap-4 text-left hover:bg-white/[0.04] transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                  <Icon name="ClipboardList" size={22} className="text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Список приёмок</div>
                  <div className="text-xs text-muted-foreground">Смотреть приёмки сотрудников</div>
                </div>
                <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
              </button>
            ) : kinds.length === 0 ? (
              <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center">
                <Icon name="PackagePlus" size={40} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Виды приёмки вам не открыты — доступны только кнопки в шапке
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
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Receipts;