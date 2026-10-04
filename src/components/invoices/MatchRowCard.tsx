import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type { MatchRow } from "./InvoiceMatch";
import ManualProductSearch from "./ManualProductSearch";
import ManualPickConfirm, { FoundProduct, ParseData } from "./ManualPickConfirm";
import { authHeaders, SEARCH_DICTS_URL } from "@/components/search-dicts/api";
import { useToast } from "@/hooks/use-toast";
import RowBrandPicker, { BrandApply } from "./RowBrandPicker";
import type { SearchBrand } from "@/components/search-dicts/api";

interface Props {
  row: MatchRow;
  mode: "article" | "name";
  brandId?: string;
  onChoose: (productId: number | null, name?: string) => void;
  onUndo?: () => void;
  brands?: SearchBrand[];
  impliedCount?: number;
  brandBusy?: boolean;
  onBrand?: (a: BrandApply) => Promise<boolean>;
}

const money = (v: number) =>
  v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TONE: Record<string, string> = {
  matched: "border-emerald-500/40 bg-emerald-500/[0.05]",
  manual: "border-emerald-500/40 bg-emerald-500/[0.05]",
  created: "border-sky-500/40 bg-sky-500/[0.05]",
  suggested: "border-amber-500/40 bg-amber-500/[0.05]",
  ambiguous: "border-amber-500/40 bg-amber-500/[0.05]",
  not_found: "border-rose-500/40 bg-rose-500/[0.05]",
  empty: "border-rose-500/40 bg-rose-500/[0.05]",
  unparsed: "border-white/[0.12] bg-white/[0.02]",
};

const REASON: Record<string, string> = {
  no_brand: "Бренд не определён — выберите бренд счёта",
  no_model: "Не удалось выделить модель из наименования",
  no_model_in_catalog: "Такой модели нет в каталоге — пойдёт в «Создать новые товары»",
  feature_new: "У модели нет такого признака — пойдёт в «Создать новые товары» как новый вариант",
  no_article_in_catalog: "Такого артикула нет в каталоге — пойдёт в «Создать новые товары»",
  brand_not_parsed: "Товары этого бренда ещё не разобраны — запустите разбор в «Справочниках для поиска»",
};

const MatchRowCard = ({ row: r, mode, brandId, onChoose, onUndo, brands = [], impliedCount = 0, brandBusy = false, onBrand }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [picked, setPicked] = useState<FoundProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const confirmPick = async (save: ParseData | null) => {
    if (!picked) return;
    if (save) {
      setSaving(true);
      try {
        const resp = await fetch(`${SEARCH_DICTS_URL}?section=product&id=${picked.id}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            group_name: save.group.trim(),
            search_brand_id: save.brandId,
            model: save.model,
            feature: save.feature,
            parse_status: "manual",
          }),
        });
        const d = await resp.json();
        if (!resp.ok) throw new Error(d.error);
        toast({ title: "Данные для поиска записаны в карточку" });
      } catch (e) {
        toast({ title: (e as Error).message || "Не удалось записать разбор", variant: "destructive" });
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    const it = picked;
    setPicked(null);
    pick(it.id, it.name);
  };
  const p = r.parsed;
  const yellow = r.match_status === "ambiguous" || r.match_status === "suggested";
  const red = ["not_found", "empty", "unparsed"].includes(r.match_status);
  const resolved = r.match_status === "matched" || r.match_status === "manual";
  const list = expanded ? r.candidates : r.candidates.slice(0, 5);
  const chosen = r.chosen_name || r.candidates.find((c) => c.id === r.product_id)?.name;

  const pick = (id: number | null, name?: string) => {
    setSearching(false);
    onChoose(id, name);
  };

  return (
    <div className={`rounded-xl border p-3 ${TONE[r.match_status] || "border-white/[0.08]"}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        {mode === "article" && <span className="font-mono text-sm">{r.article || "без артикула"}</span>}
        {mode === "article" && r.article_guessed && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">из наименования</span>
        )}
        <span className={`text-sm flex-1 min-w-0 break-words ${mode === "article" ? "text-muted-foreground" : ""}`}>{r.name}</span>
        <span className="text-sm">{r.qty ?? 0} × {money(r.price ?? 0)}</span>
      </div>

      {mode === "name" && p && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs">
          <span><span className="text-muted-foreground">Группа: </span>{p.group || "—"}</span>
          <span>
            <span className="text-muted-foreground">Бренд: </span>{p.brand || "—"}
            {p.brand_implied && <span className="text-muted-foreground"> (бренд счёта)</span>}
            {p.brand_implied && onBrand && !resolved && r.match_status !== "created" && (
              <button className="ml-2 text-primary hover:underline" onClick={() => setBrandOpen(!brandOpen)}>
                Уточнить бренд
              </button>
            )}
          </span>
          <span><span className="text-muted-foreground">Модель: </span><span className="font-mono">{p.model || "—"}</span></span>
          {p.feature && <span><span className="text-muted-foreground">Признак: </span>{p.feature}</span>}
        </div>
      )}

      {brandOpen && onBrand && (
        <RowBrandPicker
          brands={brands}
          defaultBrandId={brandId}
          lineWord={p?.line_word}
          sameCount={impliedCount}
          busy={brandBusy}
          onApply={async (a) => { if (await onBrand(a)) setBrandOpen(false); }}
          onClose={() => setBrandOpen(false)}
        />
      )}

      {yellow && (
        <div className="mt-2">
          <p className="text-sm font-medium text-amber-400">
            {r.match_status === "suggested"
              ? (mode === "name" ? "Точной модели нет — похожие варианты" : "Точного артикула нет — похожие варианты")
              : r.match_reason === "feature_differs"
                ? "Модель есть, но признак другой"
                : r.match_reason === "feature_not_found"
                  ? "Такого признака у модели нет"
                  : "Нужен выбор — несколько подходящих товаров"}
          </p>
          {r.catalog_features && r.catalog_features.length > 0 && r.match_reason !== "feature_many" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              В счёте: <span className="text-foreground">{p?.feature || "—"}</span> · в каталоге: {r.catalog_features.join(", ")}
            </p>
          )}
          <div className="mt-2 space-y-1">
            {list.map((c, idx) => (
              <div key={c.id} className="flex items-stretch gap-1">
                <button
                  onClick={() => pick(c.id, c.name)}
                  className="flex-1 min-w-0 text-left rounded-lg border border-white/[0.08] bg-card px-3 py-2 hover:bg-white/[0.04] transition"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs text-amber-300">{mode === "name" ? c.model : c.article}</span>
                    <span className="text-sm flex-1 min-w-0 break-words">{c.name}</span>
                    {c.distance != null && c.distance > 0 && (
                      <span className="text-[11px] text-muted-foreground">отличие: {c.distance} зн.</span>
                    )}
                    {mode === "article" && c.product_group && (
                      <span className="text-[11px] text-muted-foreground">{c.product_group}</span>
                    )}
                  </div>
                </button>
                {idx === 0 && (
                  <Button size="sm" className="h-auto rounded-lg shrink-0" onClick={() => pick(c.id, c.name)}>
                    <Icon name="Check" size={14} />
                    <span className="ml-1 hidden sm:inline">Подтвердить</span>
                  </Button>
                )}
              </div>
            ))}
            {r.candidates.length > 5 && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full text-center text-xs text-muted-foreground py-2 hover:text-foreground transition"
              >
                Показать ещё {r.candidates.length - 5}
              </button>
            )}
            <button
              onClick={() => pick(null)}
              className="w-full text-left rounded-lg border border-dashed border-rose-400/40 px-3 py-2 hover:bg-rose-500/[0.06] transition"
            >
              <span className="text-sm text-rose-300">Ничего не подходит — новый товар</span>
            </button>
          </div>
        </div>
      )}

      {red && (
        <p className={`mt-2 text-sm ${r.match_status === "unparsed" ? "text-muted-foreground" : "text-rose-400"}`}>
          {r.match_reason === "feature_new" && r.catalog_features?.length
            ? `${REASON.feature_new}. В каталоге: ${r.catalog_features.join(", ")}`
            : (r.match_reason && REASON[r.match_reason]) ||
            (r.match_status === "empty" ? "Артикул не определён" : "В каталоге не найден — пойдёт в «Создать новые товары»")}
        </p>
      )}

      {r.match_status === "created" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-sky-400 flex-1 min-w-0 break-words">Создан новый товар{chosen ? `: ${chosen}` : ""}</p>
          {onUndo && (
            <button className="text-xs text-muted-foreground hover:text-foreground underline" onClick={onUndo}>
              Отменить создание
            </button>
          )}
        </div>
      )}

      {resolved && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-emerald-400 flex-1 min-w-0 break-words">
            {r.match_status === "manual"
              ? "Выбран вручную"
              : r.match_type === "exact_feature"
                ? "Найден по модели и признаку"
                : r.match_type === "exact_name"
                  ? "Найден по наименованию"
                  : "Найден"}
            {chosen ? `: ${chosen}` : ""}
          </p>
          <button className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => pick(null)}>
            Сбросить
          </button>
        </div>
      )}

      {(yellow || red) && (
        <div className="mt-2">
          {picked ? (
            <ManualPickConfirm
              product={picked}
              fromRow={{ group: p?.group, brand: p?.brand, model: p?.model, feature: p?.feature }}
              brands={brands}
              busy={saving}
              onConfirm={confirmPick}
              onCancel={() => setPicked(null)}
            />
          ) : !searching ? (
            <button
              onClick={() => setSearching(true)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Icon name="Search" size={12} />
              Найти товар в каталоге вручную
            </button>
          ) : (
            <ManualProductSearch
              initial={(mode === "name" && p?.model) || r.article || ""}
              brandId={brandId}
              onPick={(it) => setPicked(it)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default MatchRowCard;