import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import { Country1C, Group1C, NewItem, TnvedKind, newItemProblems } from "@/pages/odata/nomenApi";
import NomenNewItemRow from "./NomenNewItemRow";

interface Props {
  items: NewItem[];
  groups: Group1C[];
  tnved: Record<string, TnvedKind>;
  countries: Country1C[];
  loading: boolean;
  onChange: (idx: number, patch: Partial<NewItem>) => void;
  onAll: (patch: Partial<NewItem>) => void;
  onReload: () => void;
}

const NomenNewItems = ({ items, groups, tnved, countries, loading, onChange, onAll, onReload }: Props) => {
  const [allGroup, setAllGroup] = useState("");
  const ready = items.filter((x) => newItemProblems(x).length === 0).length;

  return (
    <section className="rounded-xl border border-white/[0.08] bg-card">
      <div className="p-4 space-y-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold flex items-center gap-2 flex-1">
            <Icon name="ClipboardList" size={18} className="text-primary" />
            3. Новые позиции · {items.length}
          </div>
          <span
            className={`text-xs rounded-md px-2 py-1 ${
              ready === items.length ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
            }`}
          >
            Готово {ready} из {items.length}
          </span>
          <Button variant="ghost" size="sm" onClick={onReload} disabled={loading}>
            <Icon name={loading ? "Loader2" : "RefreshCw"} size={14} className={loading ? "animate-spin" : ""} />
            Обновить из 1С
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Автоматически: ставка НДС 22%, единица «шт», вид номенклатуры «Товары». Код ТНВЭД подставлен
          самый частый у похожих товаров в 1С — проверьте.
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1">
            <span className="text-xs text-muted-foreground">Группа для всех позиций</span>
            <Select value={allGroup} onValueChange={setAllGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Выбрать группу" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!allGroup} onClick={() => onAll({ groupKey: allGroup })}>
            Проставить всем
          </Button>
        </div>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {items.map((x) => (
          <NomenNewItemRow
            key={x.idx}
            item={x}
            groups={groups}
            tnved={tnved[x.kind]}
            countries={countries}
            onChange={(p) => onChange(x.idx, p)}
          />
        ))}
      </div>
    </section>
  );
};

export default NomenNewItems;
