import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import PickList from "@/components/search-dicts/PickList";
import type { SearchBrand } from "@/components/search-dicts/api";

export interface BrandApply {
  brandId: number;
  word: string | null;
  all: boolean;
}

interface Props {
  brands: SearchBrand[];
  defaultBrandId?: string;
  lineWord?: string | null;
  sameCount: number;
  busy: boolean;
  onApply: (a: BrandApply) => void;
  onClose: () => void;
}

const RowBrandPicker = ({ brands, defaultBrandId, lineWord, sameCount, busy, onApply, onClose }: Props) => {
  const [bid, setBid] = useState(defaultBrandId || "");
  const [remember, setRemember] = useState(!!lineWord);
  const [all, setAll] = useState(false);
  const name = brands.find((b) => String(b.id) === bid)?.name;

  return (
    <div className="mt-2 rounded-lg border border-white/[0.1] bg-white/[0.03] p-3 space-y-2">
      <PickList
        value={bid}
        onChange={setBid}
        placeholder="Выберите бренд"
        options={brands.map((b) => ({ value: String(b.id), label: b.name, count: b.products }))}
      />
      {lineWord && (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 mt-0.5 accent-primary" />
          <span>
            Запомнить: «{lineWord}» — это {name || "выбранный бренд"}
            <span className="block text-xs text-muted-foreground">
              Слово добавится к бренду, каталог разберётся заново, и такие товары будут находиться сами.
            </span>
          </span>
        </label>
      )}
      {!remember && sameCount > 1 && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="w-4 h-4 accent-primary" />
          Для всех строк с брендом счёта ({sameCount})
        </label>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="rounded-lg"
          disabled={!bid || busy}
          onClick={() => onApply({ brandId: Number(bid), word: remember ? lineWord || null : null, all })}
        >
          <Icon name={busy ? "Loader" : "Check"} size={14} className={busy ? "animate-spin" : ""} />
          <span className="ml-1">Применить</span>
        </Button>
        <Button size="sm" variant="ghost" className="rounded-lg" onClick={onClose}>Отмена</Button>
      </div>
    </div>
  );
};

export default RowBrandPicker;
