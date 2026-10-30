import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriceKind } from "@/pages/odata/nomenApi";

interface Props {
  kinds: PriceKind[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}

const NomenPriceKind = ({ kinds, value, onChange, disabled }: Props) => (
  <div className="space-y-1 max-w-xs">
    <span className="text-xs text-muted-foreground">Вид цены для документа «Установка цен»</span>
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={kinds.length ? "Выбрать" : "Загружаю…"} />
      </SelectTrigger>
      <SelectContent>
        {kinds.map((k) => (
          <SelectItem key={k.key} value={k.key}>
            {k.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export default NomenPriceKind;
