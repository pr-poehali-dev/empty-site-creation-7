import { useDebug } from "@/contexts/DebugContext";

interface DebugBadgeProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

const DebugBadge = ({ id, children, className = "" }: DebugBadgeProps) => {
  const { debugMode } = useDebug();

  return (
    <div className={`relative ${className}`}>
      {children}
      {debugMode && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            navigator.clipboard.writeText(id);
          }}
          className="absolute -top-2 -right-2 z-50 px-1 py-0.5 text-[9px] font-mono leading-none bg-amber-500 text-black rounded cursor-pointer hover:bg-amber-400 whitespace-nowrap shadow-lg"
          title="Нажми чтобы скопировать"
        >
          {id}
        </span>
      )}
    </div>
  );
};

export default DebugBadge;
