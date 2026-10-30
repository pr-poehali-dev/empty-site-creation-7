import { Checkbox } from "@/components/ui/checkbox";
import { FIELD_TITLES, MatchField, MatchOptions } from "@/pages/odata/nomenApi";

interface Props {
  opts: MatchOptions;
  onChange: (o: MatchOptions) => void;
  filled: Record<MatchField, number>;
  total: number;
  disabled: boolean;
}

const ORDER: MatchField[] = ["article", "name", "barcode"];

const NomenFieldsPicker = ({ opts, onChange, filled, total, disabled }: Props) => {
  const fields = opts.fields || [];
  const toggle = (f: MatchField) => {
    const next = fields.includes(f) ? fields.filter((x) => x !== f) : ORDER.filter((x) => x === f || fields.includes(x));
    onChange({ ...opts, fields: next, checkBarcodes: next.includes("barcode") ? false : opts.checkBarcodes });
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Отметьте, по чему искать. Если отмечено несколько — товар считается найденным, только когда у одной карточки
        совпали все отмеченные реквизиты, заполненные в счёте. Совпала часть — позиция «Частично».
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {ORDER.map((f) => (
          <label
            key={f}
            className={`flex items-start gap-2.5 cursor-pointer rounded-lg border p-2.5 transition-colors ${
              fields.includes(f) ? "border-primary bg-primary/10" : "border-white/[0.08] hover:bg-white/[0.04]"
            }`}
          >
            <Checkbox
              checked={fields.includes(f)}
              disabled={disabled}
              onCheckedChange={() => toggle(f)}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">{FIELD_TITLES[f]}</div>
              <div className="text-xs text-muted-foreground">
                в счёте {filled[f]} из {total}
              </div>
            </div>
          </label>
        ))}
      </div>
      {!fields.length && <div className="text-xs text-amber-400">Выберите хотя бы один реквизит.</div>}

      {!fields.includes("barcode") && (
        <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-white/[0.08] p-2.5">
          <Checkbox
            checked={opts.checkBarcodes}
            disabled={disabled}
            onCheckedChange={(v) => onChange({ ...opts, checkBarcodes: v === true })}
            className="mt-0.5"
          />
          <div>
            <div className="text-sm font-medium">Проверить штрихкоды у найденных</div>
            <div className="text-xs text-muted-foreground">
              Сверить штрихкод найденной карточки со счётом и предложить дописать недостающие
            </div>
          </div>
        </label>
      )}
    </div>
  );
};

export default NomenFieldsPicker;
