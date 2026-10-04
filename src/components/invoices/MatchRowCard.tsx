import { useState } from "react";
import type { MatchRow } from "./InvoiceMatch";

interface Props {
  row: MatchRow;
  mode: "article" | "name";
  onChoose: (productId: number | null) => void;
}

const money = (v: number) =>
  v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TONE: Record<string, string> = {
  matched: "border-emerald-500/40 bg-emerald-500/[0.05]",
  manual: "border-emerald-500/40 bg-emerald-500/[0.05]",
  suggested: "border-amber-500/40 bg-amber-500/[0.05]",
  ambiguous: "border-amber-500/40 bg-amber-500/[0.05]",
  not_found: "border-rose-500/40 bg-rose-500/[0.05]",
  empty: "border-rose-500/40 bg-rose-500/[0.05]",
  unparsed: "border-white/[0.12] bg-white/[0.02]",
};

const REASON: Record<string, string> = {
  no_brand: "Бренд не определён — выберите бренд счёта",
  no_model: "Не удалось выделить модель из наименования",
  no_model_in_catalog: "Такой модели нет в каталоге",
  brand_not_parsed: "Товары этого бренда ещё не разобраны — запустите разбор в «Справочниках для поиска»",
};

const MatchRowCard = ({ row: r, mode, onChoose }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const p = r.parsed;
  const showCands = r.match_status === "ambiguous" || r.match_status === "suggested";
  const list = expanded ? r.candidates : r.candidates.slice(0, 5);

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
          </span>
          <span><span className="text-muted-foreground">Модель: </span><span className="font-mono">{p.model || "—"}</span></span>
          {p.feature && <span><span className="text-muted-foreground">Признак: </span>{p.feature}</span>}
        </div>
      )}

      {showCands && (
        <div className="mt-2">
          <p className="text-sm font-medium text-amber-400">
            {r.match_status === "suggested"
              ? "Точной модели нет — похожие варианты"
              : "Нужен выбор — несколько подходящих товаров"}
          </p>
          <div className="mt-2 space-y-1">
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => onChoose(c.id)}
                className="w-full text-left rounded-lg border border-white/[0.08] bg-card px-3 py-2 hover:bg-white/[0.04] transition"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs text-amber-300">{mode === "name" ? c.model : c.article}</span>
                  <span className="text-sm flex-1">{c.name}</span>
                  {mode === "name" && c.distance != null && c.distance > 0 && (
                    <span className="text-[11px] text-muted-foreground">отличие: {c.distance} зн.</span>
                  )}
                  {mode === "article" && c.product_group && (
                    <span className="text-[11px] text-muted-foreground">{c.product_group}</span>
                  )}
                </div>
              </button>
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
              onClick={() => onChoose(null)}
              className="w-full text-left rounded-lg border border-dashed border-rose-400/40 px-3 py-2 hover:bg-rose-500/[0.06] transition"
            >
              <span className="text-sm text-rose-300">Ничего не подходит — создать новый товар</span>
            </button>
          </div>
        </div>
      )}

      {(r.match_status === "not_found" || r.match_status === "empty" || r.match_status === "unparsed") && (
        <p className={`mt-2 text-sm ${r.match_status === "unparsed" ? "text-muted-foreground" : "text-rose-400"}`}>
          {(r.match_reason && REASON[r.match_reason]) ||
            (r.match_status === "empty" ? "Артикул не определён" : "В каталоге не найден — карточку создадим на следующем шаге")}
        </p>
      )}

      {r.match_status === "matched" && mode === "name" && r.candidates[0] && (
        <p className="mt-2 text-sm text-emerald-400 break-words">Найден: {r.candidates[0].name}</p>
      )}
      {r.match_status === "manual" && <p className="mt-2 text-sm text-emerald-400">Выбран вручную</p>}
    </div>
  );
};

export default MatchRowCard;
