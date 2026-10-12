import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import { Group1C, NewItem, TnvedKind, newItemProblems } from "@/pages/odata/nomenApi";

interface Props {
  item: NewItem;
  groups: Group1C[];
  tnved?: TnvedKind;
  onChange: (patch: Partial<NewItem>) => void;
}

const Field = ({ label, children, bad }: { label: string; children: React.ReactNode; bad?: boolean }) => (
  <label className="block space-y-1">
    <span className={`text-xs ${bad ? "text-rose-400" : "text-muted-foreground"}`}>{label}</span>
    {children}
  </label>
);

const NomenNewItemRow = ({ item, groups, tnved, onChange }: Props) => {
  const problems = newItemProblems(item);
  const bad = (k: string) => problems.includes(k);
  const options = tnved?.options || [];
  const known = options.some((o) => o.code === item.tnved);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground w-7 shrink-0 pt-2">{item.idx + 1}</span>
        <div className="flex-1 min-w-0">
          <Field label="Наименование" bad={bad("наименование")}>
            <Input value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
        </div>
        <span
          className={`text-xs rounded-md px-2 py-1 shrink-0 mt-6 flex items-center gap-1 ${
            problems.length ? "text-amber-400 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10"
          }`}
        >
          <Icon name={problems.length ? "CircleAlert" : "CircleCheck"} size={13} />
          {problems.length ? `не хватает: ${problems.length}` : "готово"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 ml-9">
        <Field label="Артикул" bad={bad("артикул")}>
          <Input value={item.article} onChange={(e) => onChange({ article: e.target.value })} />
        </Field>
        <Field label="Штрихкод">
          <Input
            value={item.barcode}
            inputMode="numeric"
            onChange={(e) => onChange({ barcode: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Группа" bad={bad("группа")}>
          <Select value={item.groupKey} onValueChange={(v) => onChange({ groupKey: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Выбрать" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Базовая цена, ₽" bad={bad("цена")}>
          <Input
            value={item.price}
            inputMode="decimal"
            placeholder={item.invoicePrice ? `в счёте ${item.invoicePrice}` : "0"}
            onChange={(e) => onChange({ price: e.target.value })}
          />
        </Field>
        <Field label="Вес из сертификата, кг" bad={bad("вес")}>
          <Input
            value={item.weight}
            inputMode="decimal"
            placeholder="0,0"
            onChange={(e) => onChange({ weight: e.target.value })}
          />
        </Field>
        <Field label="Код ТНВЭД" bad={bad("ТНВЭД")}>
          {options.length > 0 ? (
            <Select
              value={known ? item.tnved : "__custom"}
              onValueChange={(v) =>
                v === "__custom"
                  ? onChange({ tnved: "", tnvedKey: "" })
                  : onChange({ tnved: v, tnvedKey: options.find((o) => o.code === v)?.key || "" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.key} value={o.code}>
                    {o.code} · у {o.count}
                  </SelectItem>
                ))}
                <SelectItem value="__custom">Ввести вручную</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {(!options.length || !known) && (
            <Input
              className={options.length ? "mt-1.5" : ""}
              value={item.tnved}
              inputMode="numeric"
              maxLength={10}
              placeholder="10 цифр"
              onChange={(e) => onChange({ tnved: e.target.value.replace(/\D/g, ""), tnvedKey: "" })}
            />
          )}
        </Field>
      </div>

      <div className="ml-9 text-xs text-muted-foreground">
        Тип «{item.kind}»:{" "}
        {tnved
          ? tnved.similar
            ? `похожих в 1С ${tnved.similar}, с кодом ТНВЭД ${options.reduce((s, o) => s + o.count, 0)}`
            : "похожих в 1С нет — код ТНВЭД введите вручную"
          : "подбираю ТНВЭД…"}
      </div>
    </div>
  );
};

export default NomenNewItemRow;
