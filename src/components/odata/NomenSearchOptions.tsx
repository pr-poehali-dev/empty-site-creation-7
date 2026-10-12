import { Checkbox } from "@/components/ui/checkbox";
import { MatchOptions, SEARCH_BY_TITLES, SearchBy } from "@/pages/odata/nomenApi";

interface Props {
  opts: MatchOptions;
  onChange: (o: MatchOptions) => void;
  filled: Record<SearchBy, number>;
  total: number;
  disabled: boolean;
}

const Tile = ({
  active,
  onClick,
  disabled,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  title: string;
  hint: string;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`rounded-lg border p-2.5 text-left transition-colors ${
      active ? "border-primary bg-primary/10" : "border-white/[0.08] hover:bg-white/[0.04]"
    }`}
  >
    <div className="text-sm font-medium">{title}</div>
    <div className="text-xs text-muted-foreground">{hint}</div>
  </button>
);

const NomenSearchOptions = ({ opts, onChange, filled, total, disabled }: Props) => {
  const set = (p: Partial<MatchOptions>) => onChange({ ...opts, ...p });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile
          active={opts.mode === "single"}
          disabled={disabled}
          onClick={() => set({ mode: "single" })}
          title="По одному реквизиту"
          hint="Артикул, штрихкод или наименование"
        />
        <Tile
          active={opts.mode === "all"}
          disabled={disabled}
          onClick={() => set({ mode: "all" })}
          title="По всем трём"
          hint="Артикул + штрихкод + наименование"
        />
      </div>

      {opts.mode === "single" ? (
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SEARCH_BY_TITLES) as SearchBy[]).map((k) => (
            <Tile
              key={k}
              active={opts.by === k}
              disabled={disabled}
              onClick={() => set({ by: k })}
              title={SEARCH_BY_TITLES[k]}
              hint={`в счёте ${filled[k]} из ${total}`}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Tile
            active={opts.exact}
            disabled={disabled}
            onClick={() => set({ exact: true })}
            title="Точное совпадение"
            hint="Все заполненные в счёте реквизиты — у одной карточки"
          />
          <Tile
            active={!opts.exact}
            disabled={disabled}
            onClick={() => set({ exact: false })}
            title="Нестрогое"
            hint="Хватит совпадения хотя бы одного"
          />
        </div>
      )}

      <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-white/[0.08] p-2.5">
        <Checkbox
          checked={opts.checkBarcodes}
          disabled={disabled}
          onCheckedChange={(v) => set({ checkBarcodes: v === true })}
          className="mt-0.5"
        />
        <div>
          <div className="text-sm font-medium">Проверить штрихкоды</div>
          <div className="text-xs text-muted-foreground">
            У найденных карточек сверить штрихкод со счётом и предложить дописать недостающие
          </div>
        </div>
      </label>
    </div>
  );
};

export default NomenSearchOptions;
