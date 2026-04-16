import { useDebug } from "@/contexts/DebugContext";
import Icon from "@/components/ui/icon";

const DebugToggle = () => {
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";
  const { debugMode, toggleDebug } = useDebug();

  if (!isOwner) return null;

  return (
    <button
      onClick={toggleDebug}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-all border ${
        debugMode
          ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
          : "bg-white/[0.04] text-muted-foreground border-white/[0.08] hover:bg-white/[0.08]"
      }`}
      title={debugMode ? "Выключить отладку" : "Включить отладку"}
    >
      <Icon name="Bug" size={12} />
      <span>DBG</span>
    </button>
  );
};

export default DebugToggle;
