import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import {
  Country1C,
  Group1C,
  NewItem,
  SITES,
  SiteId,
  SiteProduct,
  SiteSettings,
  TnvedKind,
  newItemProblems,
  siteLookup,
} from "@/pages/odata/nomenApi";

const SITE_KEY = "nomen_site_settings";
const loadSite = (): SiteSettings => {
  try {
    return { site: "", wgPrice: "price", ...JSON.parse(localStorage.getItem(SITE_KEY) || "{}") };
  } catch {
    return { site: "", wgPrice: "price" };
  }
};
import NomenNewItemRow from "./NomenNewItemRow";
import NomenGroupCreate from "./NomenGroupCreate";

interface Props {
  items: NewItem[];
  groups: Group1C[];
  tnved: Record<string, TnvedKind>;
  countries: Country1C[];
  loading: boolean;
  onChange: (idx: number, patch: Partial<NewItem>) => void;
  onAll: (patch: Partial<NewItem>) => void;
  onReload: () => void;
  base: string;
  onGroupAdded: (g: Group1C) => void;
  tnvedMissing: string[];
  similarCountry: boolean;
  onSimilarCountry: (on: boolean) => void;
}

type TnFilter = "all" | "has" | "none" | "missing" | "skip";

const NomenNewItems = ({ items, groups, tnved, countries, loading, onChange, onAll, onReload, base, onGroupAdded, tnvedMissing, similarCountry, onSimilarCountry }: Props) => {
  const [tf, setTf] = useState<TnFilter>("all");
  const [allGroup, setAllGroup] = useState("");
  const [site, setSiteState] = useState<SiteSettings>(loadSite);
  const cache = useRef(new Map<string, Promise<SiteProduct>>());
  const setSite = (p: Partial<SiteSettings>) => {
    const next = { ...site, ...p };
    setSiteState(next);
    localStorage.setItem(SITE_KEY, JSON.stringify(next));
  };
  const lookup = (article: string) => {
    const k = `${site.site}|${article.trim().toLowerCase()}`;
    let p = cache.current.get(k);
    if (!p) {
      p = siteLookup(base, site.site, article);
      cache.current.set(k, p);
      p.catch(() => cache.current.delete(k));
    }
    return p;
  };
  const active = items.filter((x) => !x.skip);
  const skipped = items.length - active.length;
  const ready = active.filter((x) => newItemProblems(x).length === 0).length;
  const isMissing = (x: NewItem) => tnvedMissing.includes(x.fileTnved || x.tnved.trim());
  const tnCounts = {
    all: items.length,
    has: items.filter((x) => x.fileTnved).length,
    none: items.filter((x) => !x.fileTnved).length,
    missing: items.filter(isMissing).length,
    skip: skipped,
  };
  const shown = items.filter((x) =>
    tf === "skip"
      ? x.skip
      : tf === "has"
        ? x.fileTnved
        : tf === "none"
          ? !x.fileTnved
          : tf === "missing"
            ? isMissing(x)
            : true,
  );
  const tnChips: [TnFilter, string, string][] = [
    ["all", "Все", ""],
    ["has", "ТН ВЭД в файле есть", "text-emerald-400"],
    ["none", "ТН ВЭД в файле нет", "text-amber-400"],
    ["missing", "Код не в 1С", "text-rose-400"],
    ["skip", "Не загружать", "text-muted-foreground"],
  ];

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
              ready === active.length ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
            }`}
          >
            Готово {ready} из {active.length}
          </span>
          {skipped > 0 && (
            <button
              type="button"
              onClick={() => setTf(tf === "skip" ? "all" : "skip")}
              className={`text-xs rounded-md px-2 py-1 flex items-center gap-1 bg-white/[0.06] ${
                tf === "skip" ? "text-foreground ring-1 ring-primary" : "text-muted-foreground"
              }`}
            >
              <Icon name="Ban" size={12} />
              Не загружать: {skipped}
            </button>
          )}
          <Button variant="ghost" size="sm" onClick={onReload} disabled={loading}>
            <Icon name={loading ? "Loader2" : "RefreshCw"} size={14} className={loading ? "animate-spin" : ""} />
            Обновить группы
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Автоматически: ставка НДС 22%, единица «шт», вид номенклатуры «Товары». Коды ТН ВЭД и подбор по
          похожим — в блоке «Коды ТН ВЭД» выше.
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1">
            <span className="text-xs text-muted-foreground">Группа для всех позиций</span>
            <div className="flex gap-1.5">
              <Select value={allGroup} onValueChange={setAllGroup}>
                <SelectTrigger className="min-w-0">
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
              <NomenGroupCreate
                base={base}
                groups={groups}
                onCreated={(g) => {
                  onGroupAdded(g);
                  setAllGroup(g.key);
                }}
              />
            </div>
          </div>
          <Button variant="outline" disabled={!allGroup} onClick={() => onAll({ groupKey: allGroup })}>
            Проставить всем
          </Button>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <Switch checked={similarCountry} onCheckedChange={onSimilarCountry} className="mt-0.5" />
          <span className="space-y-0.5">
            <span className="block text-sm">Страна по похожим</span>
            <span className="block text-xs text-muted-foreground">
              {similarCountry
                ? "Страна подставляется по похожим товарам из 1С"
                : "Выключено: страна только из файла или вручную, иначе карточка без страны"}
            </span>
          </span>
        </label>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1">
            <span className="text-xs text-muted-foreground">Где искать цену и вес</span>
            <Select value={site.site || "none"} onValueChange={(v) => setSite({ site: (v === "none" ? "" : v) as SiteId })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITES.map((s) => (
                  <SelectItem key={s.id || "none"} value={s.id || "none"}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {site.site === "weissgauff" && (
            <div className="flex rounded-md border border-white/[0.1] p-0.5 text-xs">
              {(
                [
                  ["price", "Цена"],
                  ["old", "Зачёркнутая цена"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSite({ wgPrice: v })}
                  className={`px-3 h-9 rounded ${site.wgPrice === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
        {site.site && (
          <p className="text-xs text-muted-foreground">
            Нажмите на поле цены или веса у позиции — появится «Найти на сайте». Ищется по артикулу, по одному товару.
          </p>
        )}
      </div>
      <div className="px-4 py-3 flex flex-wrap gap-1.5 border-b border-white/[0.06]">
        {tnChips
          .filter(([k]) => (k !== "missing" || tnCounts.missing > 0) && (k !== "skip" || tnCounts.skip > 0))
          .map(([k, label, cls]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTf(k)}
              className={`text-xs rounded-md px-2.5 py-1.5 border ${tf === k ? "border-primary" : "border-white/[0.08]"} ${cls}`}
            >
              {label} · {tnCounts[k]}
            </button>
          ))}
      </div>
      <div className="divide-y divide-white/[0.06]">
        {shown.length === 0 && <div className="p-4 text-sm text-muted-foreground">Нет позиций в этом фильтре.</div>}
        {shown.map((x) => (
          <NomenNewItemRow
            key={x.idx}
            item={x}
            groups={groups}
            tnved={tnved[x.kind]}
            countries={countries}
            similarCountry={similarCountry}
            onChange={(p) => onChange(x.idx, p)}
            site={site}
            lookup={lookup}
            base={base}
            onGroupAdded={onGroupAdded}
          />
        ))}
      </div>
    </section>
  );
};

export default NomenNewItems;
