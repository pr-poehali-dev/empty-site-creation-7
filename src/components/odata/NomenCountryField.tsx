import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Country1C, CountryKind, isTraceable } from "@/pages/odata/nomenApi";

const NONE = "__none";

interface Props {
  value: string;
  info: CountryKind;
  countries: Country1C[];
  onChange: (key: string) => void;
}

const NomenCountryField = ({ value, info, countries, onChange }: Props) => {
  const name = (k: string) => countries.find((c) => c.key === k)?.name || "страна из 1С";
  const used = new Set(info.options.map((o) => o.key));
  const rest = countries.filter((c) => !used.has(c.key));
  const traceable = isTraceable(value, countries);

  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">Страна происхождения</span>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground font-normal">
              У похожих: {info.basis.toLowerCase()}, {info.similar}
            </SelectLabel>
            {info.options.map((o) => (
              <SelectItem key={o.key || NONE} value={o.key || NONE}>
                {o.key ? name(o.key) : "Не указывать"} · у {o.count}
              </SelectItem>
            ))}
            {!used.has("") && <SelectItem value={NONE}>Не указывать</SelectItem>}
          </SelectGroup>
          {rest.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground font-normal">Другие страны</SelectLabel>
                {rest.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      <span className={`block text-[11px] leading-tight ${traceable ? "text-amber-400" : "text-muted-foreground"}`}>
        Прослеживаемый: {traceable ? "да" : "нет"}
      </span>
    </label>
  );
};

export default NomenCountryField;
