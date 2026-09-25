import Icon from "@/components/ui/icon";
import OutcomeChips from "./OutcomeChips";
import { KIND_SHORT, KIND_TITLES, type ReceivingRow } from "./dailyApi";

interface Props {
  row: ReceivingRow;
  /** В общем списке нужен сотрудник и полное название вида. */
  full?: boolean;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

const dateRu = (v: string) =>
  new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "2-digit" });

/** Строка приёмки. Удаление — отдельной кнопкой, чтобы не стереть вместо открытия. */
const ReceivingRowItem = ({ row, full = false, deleting, onOpen, onDelete }: Props) => (
  <div className="flex items-center hover:bg-white/[0.03] transition-colors">
    <button
      onClick={onOpen}
      className="flex-1 min-w-0 px-4 py-2.5 flex items-center gap-3 text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <span>{dateRu(row.work_date)}</span>
          {full && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="truncate">{row.employee_name}</span>
            </>
          )}
          {!row.closed && (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
              открыта
            </span>
          )}
          {row.closed && row.auto_closed && (
            <span
              className="text-[10px] rounded px-1.5 py-0.5 bg-white/[0.06] text-muted-foreground"
              title="Сутки кончились, а кнопку «Закончить» не нажали"
            >
              закрыта автоматически
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {(full ? KIND_TITLES : KIND_SHORT)[row.kind] || row.kind} · {row.qty} шт
        </div>
        {full && (
          <div className="mt-1.5">
            <OutcomeChips counters={row.counters} showZero={row.kind === "kind_check"} />
          </div>
        )}
      </div>
      {!full && <OutcomeChips counters={row.counters} />}
    </button>

    {row.can_delete ? (
      <button
        onClick={onDelete}
        disabled={deleting}
        className="shrink-0 h-9 w-9 mr-1 flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
        aria-label="Удалить приёмку"
        title="Удалить пустую приёмку"
      >
        <Icon name="Trash2" size={15} />
      </button>
    ) : (
      <Icon name="ChevronRight" size={15} className="text-muted-foreground shrink-0 mr-4" />
    )}
  </div>
);

export default ReceivingRowItem;