import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { PARSE_STATUS_LABELS, ParseStatus, SearchBrand, SearchGroup } from "./api";

export interface SearchFilterValue {
  brand: string;
  group: string;
  status: string;
}

interface Props {
  value: SearchFilterValue;
  onChange: (v: SearchFilterValue) => void;
  brands: SearchBrand[];
  groups: SearchGroup[];
}

const cls = "h-8 rounded-lg bg-secondary border border-white/[0.08] px-2 text-xs max-w-[11rem]";

const SearchFilters = ({ value, onChange, brands, groups }: Props) => {
  const navigate = useNavigate();
  const active = value.brand || value.group || value.status;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-2 py-2">
      <span className="text-xs text-primary flex items-center gap-1">
        <Icon name="ScanSearch" size={14} />
        Для поиска:
      </span>
      <select value={value.brand} onChange={(e) => onChange({ ...value, brand: e.target.value })} className={cls}>
        <option value="">Любой бренд</option>
        <option value="none">Бренд не указан</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <select value={value.group} onChange={(e) => onChange({ ...value, group: e.target.value })} className={cls}>
        <option value="">Любая группа</option>
        <option value="none">Группа не указана</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <select value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value })} className={cls}>
        <option value="">Любое состояние</option>
        {(Object.keys(PARSE_STATUS_LABELS) as ParseStatus[]).map((s) => (
          <option key={s} value={s}>{PARSE_STATUS_LABELS[s]}</option>
        ))}
      </select>
      {active && (
        <button
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => onChange({ brand: "", group: "", status: "" })}
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
