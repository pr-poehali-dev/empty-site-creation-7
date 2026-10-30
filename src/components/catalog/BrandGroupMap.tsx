import PickList from "@/components/search-dicts/PickList";
import NewFolderButton from "@/components/invoices/NewFolderButton";

export interface BrandRow {
  brand: string;
  count: number;
  group: string;
  source: string;
}

interface Props {
  rows: BrandRow[];
  map: Record<string, string>;
  folders: { name: string; products: number }[];
  onChange: (brand: string, group: string) => void;
  onNewFolder: (name: string) => void;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

const BrandGroupMap = ({ rows, map, folders, onChange, onNewFolder }: Props) => {
  const known = new Set(folders.map((f) => norm(f.name)));
  const isOk = (g: string) => !!g && known.has(norm(g));
  const ok = rows.filter((r) => isOk(map[r.brand] || "")).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-md px-2 py-1 bg-emerald-500/10 text-emerald-400">Сопоставлено: {ok}</span>
        <span className="rounded-md px-2 py-1 bg-rose-500/10 text-rose-400">Не сопоставлено: {rows.length - ok}</span>
        <div className="ml-auto">
          <NewFolderButton size="sm" existing={folders.map((f) => f.name)} onApply={onNewFolder} />
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.08] divide-y divide-white/[0.06]">
        {rows.map((r) => {
          const g = map[r.brand] || "";
          const good = isOk(g);
          return (
            <div
              key={r.brand || "__none"}
              className={`grid grid-cols-[1fr_1.4fr] items-center gap-2 p-2 ${good ? "bg-emerald-500/[0.06]" : "bg-rose-500/[0.06]"}`}
            >
              <div className="text-sm min-w-0">
                <div className={`truncate ${r.brand ? "" : "italic text-muted-foreground"}`}>{r.brand || "Без бренда"}</div>
                <div className="text-[11px] text-muted-foreground">товаров: {r.count}</div>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon_ good={good} />
                <div className="flex-1 min-w-0">
                  <PickList
                    value={g}
                    onChange={(v) => onChange(r.brand, v)}
                    placeholder="Выберите группу"
                    extra={[{ value: "", label: "Не выбрано (в «Общая»)" }]}
                    options={folders.map((f) => ({ value: f.name, label: f.name, count: f.products }))}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Icon_ = ({ good }: { good: boolean }) => (
  <span className={`h-2 w-2 shrink-0 rounded-full ${good ? "bg-emerald-400" : "bg-rose-400"}`} />
);

export default BrandGroupMap;
