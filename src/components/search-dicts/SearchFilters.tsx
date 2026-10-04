import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import PickList from "./PickList";
import { PARSE_STATUS_LABELS, ParseStatus, SearchBrand, SearchGroup } from "./api";

export interface SearchFilterValue {
  brand: string;
  group: string;
  status: string;
  notIn1c?: boolean;
}

interface Props {
  value: SearchFilterValue;
  onChange: (v: SearchFilterValue) => void;
  brands: SearchBrand[];
  groups: SearchGroup[];
}

const cls = "w-[calc(50%-0.25rem)] sm:w-44";

const SearchFilters = ({ value, onChange, brands, groups }: Props) => {
  const navigate = useNavigate();
  const active = value.brand || value.group || value.status || value.notIn1c;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-2 py-2">
      <span className="text-xs text-primary flex items-center gap-1">
        <Icon name="ScanSearch" size={14} />
        Для поиска:
      </span>
      <div className={cls}>
        <PickList
          size="sm"
          value={value.brand}
          onChange={(v) => onChange({ ...value, brand: v })}
          placeholder="Любой бренд"
          extra={[{ value: "", label: "Любой бренд" }, { value: "none", label: "Бренд не указан" }]}
          options={brands.map((b) => ({ value: String(b.id), label: b.name, count: b.products }))}
        />
      </div>
      <div className={cls}>
        <PickList
          size="sm"
          value={value.group}
          onChange={(v) => onChange({ ...value, group: v })}
          placeholder="Любая группа"
          extra={[{ value: "", label: "Любая группа" }, { value: "none", label: "Группа не указана" }]}
          options={groups.map((g) => ({ value: String(g.id), label: g.name, count: g.products }))}
        />
      </div>
      <div className={cls}>
        <PickList
          size="sm"
          sort={false}
          value={value.status}
          onChange={(v) => onChange({ ...value, status: v })}
          placeholder="Любое состояние"
          extra={[{ value: "", label: "Любое состояние" }]}
          options={(Object.keys(PARSE_STATUS_LABELS) as ParseStatus[]).map((s) => ({ value: s, label: PARSE_STATUS_LABELS[s] }))}
        />
      </div>
      <button
        onClick={() => onChange({ ...value, notIn1c: !value.notIn1c })}
        className={`h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${value.notIn1c ? "border-orange-500/50 bg-orange-500/15 text-orange-300" : "border-white/[0.08] text-muted-foreground hover:text-foreground"}`}
      >
        <Icon name="CloudOff" size={12} />
        Не выгружен в 1С
      </button>
      {active && (
        <button
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => onChange({ brand: "", group: "", status: "", notIn1c: false })}
        >
          <Icon name="X" size={12} />
          Сбросить
        </button>
      )}
      <button
        className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
        onClick={() => navigate("/admin/search-dicts")}
      >
        <Icon name="BookOpen" size={12} />
        Справочники
      </button>
    </div>
  );
};

export default SearchFilters;