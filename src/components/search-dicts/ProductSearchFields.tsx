import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import {
  callSearchDicts,
  PARSE_STATUS_COLORS,
  PARSE_STATUS_LABELS,
  ParseStatus,
  SearchBrand,
  SearchGroup,
} from "./api";

export interface SearchFieldsValue {
  search_group_id?: number | null;
  search_brand_id?: number | null;
  model?: string | null;
  feature?: string | null;
  parse_status?: ParseStatus | null;
}

interface Props {
  productId: number;
  value: SearchFieldsValue;
  brands: SearchBrand[];
  groups: SearchGroup[];
  onSaved: (v: SearchFieldsValue & { search_brand_name?: string | null; search_group_name?: string | null }) => void;
}

const selectCls = "w-full h-10 rounded-xl bg-secondary border border-white/[0.08] px-3 text-sm";

const ProductSearchFields = ({ productId, value, brands, groups, onSaved }: Props) => {
  const { toast } = useToast();
  const [groupId, setGroupId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [model, setModel] = useState("");
  const [feature, setFeature] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setGroupId(value.search_group_id ? String(value.search_group_id) : "");
    setBrandId(value.search_brand_id ? String(value.search_brand_id) : "");
    setModel(value.model || "");
    setFeature(value.feature || "");
  };

  useEffect(reset, [productId, value.search_group_id, value.search_brand_id, value.model, value.feature]);

  const status: ParseStatus = (value.parse_status as ParseStatus) || "none";
  const dirty =
    groupId !== (value.search_group_id ? String(value.search_group_id) : "") ||
    brandId !== (value.search_brand_id ? String(value.search_brand_id) : "") ||
    model !== (value.model || "") ||
    feature !== (value.feature || "");

  const save = async () => {
    setSaving(true);
    try {
      const next: SearchFieldsValue = {
        search_group_id: groupId ? Number(groupId) : null,
        search_brand_id: brandId ? Number(brandId) : null,
        model: model.trim() || null,
        feature: feature.trim() || null,
        parse_status: "manual",
      };
      await callSearchDicts("PUT", `section=product&id=${productId}`, next);
      onSaved({
        ...next,
        search_brand_name: brands.find((b) => b.id === next.search_brand_id)?.name ?? null,
        search_group_name: groups.find((g) => g.id === next.search_group_id)?.name ?? null,
      });
      toast({ title: "Поля для поиска сохранены" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="ScanSearch" size={16} className="text-primary" />
          <p className="text-sm font-medium">Для поиска</p>
        </div>
        <Badge className={`text-xs ${PARSE_STATUS_COLORS[status]}`}>{PARSE_STATUS_LABELS[status]}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Товарная группа</label>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectCls}>
            <option value="">Не указана</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Бренд</label>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={selectCls}>
            <option value="">Не указан</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Модель</label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} className="h-10 rounded-xl bg-secondary border-white/[0.08]" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Признак</label>
          <Input
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            placeholder="цвет, материал…"
            className="h-10 rounded-xl bg-secondary border-white/[0.08]"
          />
        </div>
      </div>
      {dirty && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>Отменить</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
            <span className="ml-1">Сохранить</span>
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Видно только владельцу. После ручной правки повторный разбор этот товар не меняет.
      </p>
    </div>
  );
};

export default ProductSearchFields;
