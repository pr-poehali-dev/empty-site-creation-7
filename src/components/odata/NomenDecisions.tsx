import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ConflictCard, CreateResult, Decision, NewItem } from "@/pages/odata/nomenApi";

interface Props {
  conflicts: CreateResult[];
  items: NewItem[];
  decisions: Record<number, Decision>;
  busyIdx: number | null;
  locked: boolean;
  onCreate: (idx: number) => void;
  onAttach: (idx: number, card: ConflictCard) => void;
  onSkip: (idx: number) => void;
  onUndo: (idx: number) => void;
}

const MATCH_TITLE: Record<string, string> = { article: "артикул", name: "наименование" };

const decisionText = (d: Decision) => {
  if (d.kind === "skip") return { text: "Не создавать", cls: "text-muted-foreground" };
  if (d.kind === "create") {
    const r = d.result;
    if (r.state === "created") {
      const bc =
        r.barcode === "taken"
          ? ` · ШК не записан: уже у ${r.barcode_owner?.code}`
          : r.barcode === "error"
            ? ` · ШК не записан: ${r.barcode_error}`
            : "";
      const ct = r.country === "error" ? " · страну и галочку поставьте вручную" : "";
      return { text: `Создана карточка ${r.code}${bc}${ct}`, cls: "text-emerald-400" };
    }
    return { text: `Не создана: ${r.error}`, cls: "text-rose-400" };
  }
  const t =
    d.barcode === "added"
      ? { text: `Штрихкод дописан карточке ${d.card.code}`, cls: "text-emerald-400" }
      : d.barcode === "taken"
        ? { text: `ШК не дописан: уже у карточки ${d.barcode_owner?.code}`, cls: "text-rose-400" }
        : { text: `ШК не дописан: ${d.barcode_error || "ошибка"}`, cls: "text-rose-400" };
  return t;
};

const ConflictRow = ({
  r,
  item,
  decision,
  busy,
  locked,
  onCreate,
  onAttach,
  onSkip,
  onUndo,
}: {
  r: CreateResult;
  item?: NewItem;
  decision?: Decision;
  busy: boolean;
  locked: boolean;
  onCreate: () => void;
  onAttach: (c: ConflictCard) => void;
  onSkip: () => void;
  onUndo: () => void;
}) => {
  const cards = r.cards || [];
  const [pick, setPick] = useState<string>(cards.length === 1 ? cards[0].key : "");
  const hasBc = !!item?.barcode;
  const chosen = cards.find((c) => c.key === pick);
  const dt = decision ? decisionText(decision) : null;
  const failed =
    (decision?.kind === "create" && decision.result.state !== "created") ||
    (decision?.kind === "attach" && decision.barcode !== "added");
  const canUndo = failed || (decision?.kind === "skip" && !locked);

  return (
    <div className="p-3 space-y-2">
      <div className="text-sm">{item?.name}</div>
      <div className="text-xs text-muted-foreground">
        Арт.: {item?.article || "—"} · ШК: {item?.barcode || "—"}
      </div>

      <div className="space-y-1.5">
        {cards.map((c) => (
          <label
            key={c.key}
            className={`flex items-start gap-2 text-xs rounded-lg border p-2 ${
              pick === c.key ? "border-primary/60 bg-primary/5" : "border-white/[0.08]"
            } ${decision ? "" : "cursor-pointer"}`}
          >
            {cards.length > 1 && !decision && (
              <input
                type="radio"
                className="mt-0.5"
                checked={pick === c.key}
                onChange={() => setPick(c.key)}
              />
            )}
            <div className="min-w-0">
              <div className="text-foreground">{c.name}</div>
              <div className="text-muted-foreground">
                Код {c.code} · Арт. {c.article || "—"} · ШК:{" "}
                {c.barcodes?.length ? c.barcodes.join(", ") : "нет"}
              </div>
              <div className="text-amber-400">
                Совпало: {(c.matched || []).map((m) => MATCH_TITLE[m] || m).join(", ")}
              </div>
            </div>
          </label>
        ))}
      </div>

      {dt ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs ${dt.cls}`}>{dt.text}</span>
          {canUndo ? (
            <Button size="sm" variant="ghost" onClick={onUndo}>
              Изменить
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onCreate} disabled={busy}>
            {busy && <Icon name="Loader2" size={14} className="animate-spin" />}
            Всё равно создать
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !hasBc || !chosen}
            onClick={() => chosen && onAttach(chosen)}
            title={!hasBc ? "В счёте нет штрихкода" : !chosen ? "Выберите карточку" : ""}
          >
            Это та же карточка, дописать ШК
          </Button>
          <Button size="sm" variant="ghost" onClick={onSkip} disabled={busy}>
            Не создавать
          </Button>
        </div>
      )}
    </div>
  );
};

const NomenDecisions = ({ conflicts, items, decisions, busyIdx, locked, onCreate, onAttach, onSkip, onUndo }: Props) => {
  const left = conflicts.filter((r) => !decisions[r.idx]).length;
  return (
    <section className="rounded-xl border border-amber-500/30 bg-card">
      <div className="p-4 border-b border-white/[0.06] space-y-1">
        <div className="font-semibold flex items-center gap-2">
          <Icon name="CircleHelp" size={18} className="text-amber-400" />
          Нужно решение · {conflicts.length}
        </div>
        <p className="text-xs text-muted-foreground">
          В 1С уже есть карточки с таким же артикулом или наименованием, но не с обоими сразу. Сайт
          их не создал.
        </p>
        {left > 0 && !locked && (
          <p className="text-xs text-amber-400">Цены будут установлены, когда решите по всем: осталось {left}</p>
        )}
      </div>
      <div className="divide-y divide-white/[0.06]">
        {conflicts.map((r) => (
          <ConflictRow
            key={r.idx}
            r={r}
            item={items.find((x) => x.idx === r.idx)}
            decision={decisions[r.idx]}
            busy={busyIdx === r.idx}
            locked={locked}
            onCreate={() => onCreate(r.idx)}
            onAttach={(c) => onAttach(r.idx, c)}
            onSkip={() => onSkip(r.idx)}
            onUndo={() => onUndo(r.idx)}
          />
        ))}
      </div>
    </section>
  );
};

export default NomenDecisions;
