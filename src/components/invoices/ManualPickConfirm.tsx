import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import PickList from "@/components/search-dicts/PickList";
import type { SearchBrand } from "@/components/search-dicts/api";

export interface FoundProduct {
  id: number;
  name: string;
  article: string | null;
  model: string | null;
  feature: string | null;
  search_group: string | null;
  search_brand_id: number | null;
  search_brand: string | null;
  parse_status: string | null;
}

export interface ParseData {
  group: string;
  brandId: string;
  model: string;
  feature: string;
}

interface Props {
  product: FoundProduct;
  fromRow: { group?: string | null; brand?: string | null; model?: string | null; feature?: string | null };
  brands: SearchBrand[];
  busy: boolean;
  onConfirm: (save: ParseData | null) => void;
  onCancel: () => void;
}

const sq = (s?: string | null) => (s || "").toLowerCase().replace(/[^0-9a-zа-яё]/g, "");

const ManualPickConfirm = ({ product: pr, fromRow, brands, busy, onConfirm, onCancel }: Props) => {
  const parsed = !!(pr.search_brand_id && pr.model);
  const rowBrandId = brands.find((b) => b.name === fromRow.brand)?.id;
  const differs = parsed && (
    (fromRow.model && sq(fromRow.model) !== sq(pr.model)) ||
    (rowBrandId && rowBrandId !== pr.search_brand_id)
  );
  const [save, setSave] = useState(!parsed);
  const [d, setD] = useState<ParseData>({
    group: fromRow.group || pr.search_group || "",
    brandId: String(rowBrandId || pr.search_brand_id || ""),
    model: fromRow.model || pr.model || "",
    feature: fromRow.feature || pr.feature || "",
  });
  const showForm = !parsed || differs;
  const ok = !save || (d.brandId && d.model.trim());

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-card p-3 space-y-2">
      <p className="text-sm break-words">
        <span className="text-muted-foreground">Выбран: </span>{pr.name}
      </p>

      {showForm && (
        <>
          {parsed ? (
            <p className="text-xs text-amber-300">
              В карточке: {pr.search_brand} {pr.model} · в счёте: {fromRow.brand || "—"} {fromRow.model || "—"}
            </p>
          ) : (
            <p className="text-xs text-amber-300">Товар не разобран — заполните данные для поиска</p>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="w-4 h-4 accent-primary" />
            {parsed ? "Перезаписать данные для поиска в карточке" : "Записать данные для поиска в карточку товара"}
          </label>
          {save && (
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center text-xs">
              <span className="text-muted-foreground">Группа</span>
              <Input value={d.group} onChange={(e) => setD({ ...d, group: e.target.value })} className="h-8 rounded-lg" />
              <span className="text-muted-foreground">Бренд</span>
              <PickList
                value={d.brandId}
                onChange={(v) => setD({ ...d, brandId: v })}
                placeholder="Выберите бренд"
                size="sm"
                options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
              />
              <span className="text-muted-foreground">Модель</span>
              <Input value={d.model} onChange={(e) => setD({ ...d, model: e.target.value })} className="h-8 rounded-lg font-mono" />
              <span className="text-muted-foreground">Признак</span>
              <Input value={d.feature} onChange={(e) => setD({ ...d, feature: e.target.value })} className="h-8 rounded-lg" />
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <Button size="sm" className="rounded-lg" disabled={busy || !ok} onClick={() => onConfirm(showForm && save ? d : null)}>
          <Icon name={busy ? "Loader" : "Check"} size={14} className={busy ? "animate-spin" : ""} />
          <span className="ml-1">Сопоставить</span>
        </Button>
        <Button size="sm" variant="ghost" className="rounded-lg" onClick={onCancel}>Назад к поиску</Button>
      </div>
    </div>
  );
};

export default ManualPickConfirm;
