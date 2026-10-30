import { Checkbox } from "@/components/ui/checkbox";
import { MATCH_FIELDS, MatchField } from "./api";

interface Props {
  extract: boolean;
  onExtract: (v: boolean) => void;
  match: boolean;
  onMatch: (v: boolean) => void;
  fields: MatchField[];
  onFields: (v: MatchField[]) => void;
  disabled?: boolean;
}

const Row = ({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
    <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
    {label}
  </label>
);

const BuildOptions = ({ extract, onExtract, match, onMatch, fields, onFields, disabled }: Props) => (
  <div className="space-y-2">
    <Row checked={extract} onChange={onExtract} label="Извлекать артикулы из наименования" disabled={disabled} />
    <Row checked={match} onChange={onMatch} label="Сверить с каталогом" disabled={disabled} />
    {match && (
      <div className="ml-6 flex flex-wrap gap-x-4 gap-y-2">
        {MATCH_FIELDS.map((f) => (
          <Row
            key={f.value}
            label={f.label}
            disabled={disabled}
            checked={fields.includes(f.value)}
            onChange={(on) => onFields(on ? [...fields, f.value] : fields.filter((x) => x !== f.value))}
          />
        ))}
        {!fields.length && <span className="text-xs text-rose-400">Выберите хотя бы один параметр</span>}
      </div>
    )}
  </div>
);

export default BuildOptions;
