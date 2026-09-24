import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type { DailyItem } from "./dailyApi";

interface Props {
  item: DailyItem;
  busy: boolean;
  onUndo: () => void;
}

const LABELS: Record<string, { text: string; cls: string }> = {
  sale: { text: "На продажу · СГП", cls: "text-emerald-300" },
  wipe: { text: "На протирку · Протирка", cls: "text-sky-300" },
  repair: { text: "Не работает · Под ремонт", cls: "text-amber-300" },
  scrap: { text: "Утиль", cls: "text-rose-300" },
};

/** Тапнул не ту кнопку — откат последнего, чтобы мастер не искал единицу заново. */
const LastCheck = ({ item, busy, onUndo }: Props) => {
  const label = LABELS[item.check_result || ""] || {
    text: "Записано",
    cls: "text-foreground",
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-3 flex items-center gap-3">
      <Icon name="CircleCheck" size={20} className="text-emerald-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${label.cls}`}>{label.text}</div>
        <div className="text-xs text-muted-foreground truncate">
          {item.tech_name}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 shrink-0"
        disabled={busy}
        onClick={onUndo}
      >
        <Icon name="Undo2" size={15} className="mr-1" />
        Отменить
      </Button>
    </div>
  );
};

export default LastCheck;
