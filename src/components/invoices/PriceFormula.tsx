import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Icon from "@/components/ui/icon";

export interface FormulaStep {
  operator: string;
  value: string;
}

export const PRICE_FIELDS = [
  { value: "price_purchase", label: "Закупочная" },
  { value: "price_base", label: "Базовая" },
  { value: "price_retail", label: "Розничная" },
  { value: "price_wholesale", label: "Оптовая" },
];

export const SOURCES = [{ value: "invoice", label: "Цена из счёта" }, ...PRICE_FIELDS.map((f) => ({ ...f, label: `${f.label} в каталоге` }))];

const OPERATORS = [
  { value: "*", label: "×" },
  { value: "/", label: "÷" },
  { value: "+", label: "+" },
  { value: "-", label: "−" },
];

const HINTS: { label: string; step: FormulaStep }[] = [
  { label: "+20%", step: { operator: "*", value: "1.2" } },
  { label: "+30%", step: { operator: "*", value: "1.3" } },
  { label: "+50%", step: { operator: "*", value: "1.5" } },
  { label: "+500 ₽", step: { operator: "+", value: "500" } },
  { label: "+1000 ₽", step: { operator: "+", value: "1000" } },
];

export function applySteps(price: number, steps: FormulaStep[]): number {
  let r = price;
  for (const s of steps) {
    const v = parseFloat(String(s.value).replace(",", "."));
    if (isNaN(v)) continue;
    if (s.operator === "*") r *= v;
    else if (s.operator === "/") r = v ? r / v : r;
    else if (s.operator === "+") r += v;
    else if (s.operator === "-") r -= v;
  }
  return Math.ceil(Math.round(r * 100) / 100);
}

interface Props {
  source: string;
  steps: FormulaStep[];
  onSource: (v: string) => void;
  onSteps: (s: FormulaStep[]) => void;
}

const PriceFormula = ({ source, steps, onSource, onSteps }: Props) => {
  const update = (i: number, key: keyof FormulaStep, v: string) =>
    onSteps(steps.map((s, idx) => (idx === i ? { ...s, [key]: v } : s)));

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Считать от</label>
        <Select value={source} onValueChange={onSource}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <label className="text-xs text-muted-foreground block">Шаги формулы</label>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={s.operator} onValueChange={(v) => update(i, "operator", v)}>
            <SelectTrigger className="w-16 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            inputMode="decimal"
            value={s.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder="Число"
            className="flex-1 rounded-xl"
          />
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onSteps(steps.filter((_, idx) => idx !== i))}>
            <Icon name="X" size={14} />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5">
        {HINTS.map((h) => (
          <button
            key={h.label}
            onClick={() => onSteps([...steps, { ...h.step }])}
            className="px-2.5 h-7 rounded-lg text-xs border border-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
          >
            {h.label}
          </button>
        ))}
        <button
          onClick={() => onSteps([...steps, { operator: "*", value: "" }])}
          className="px-2.5 h-7 rounded-lg text-xs border border-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] inline-flex items-center gap-1"
        >
          <Icon name="Plus" size={12} /> Свой шаг
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Итог округляется до рубля вверх.</p>
    </div>
  );
};

export default PriceFormula;
