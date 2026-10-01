import Icon from "@/components/ui/icon";

interface Props {
  shown: number;
  total: number;
  busy: boolean;
  onMore: () => void;
  /** Отступ слева — чтобы кнопка стояла под строками своего уровня. */
  indent?: string;
}

/** «Показать ещё (осталось N)» — везде, где не влезло 200 строк. */
const ShowMore = ({ shown, total, busy, onMore, indent = "pl-4" }: Props) => {
  if (shown >= total) return null;
  return (
    <button
      onClick={onMore}
      disabled={busy}
      className={`w-full ${indent} pr-4 py-2.5 flex items-center gap-2 text-xs text-sky-300 hover:bg-white/[0.03] disabled:opacity-60 transition-colors`}
    >
      <Icon name={busy ? "Loader2" : "ChevronsDown"} size={14} className={busy ? "animate-spin" : ""} />
      Показать ещё (осталось {total - shown})
    </button>
  );
};

export default ShowMore;
