import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { CreateResult, NewItem, PriceDocResult } from "@/pages/odata/nomenApi";

interface Props {
  items: NewItem[];
  readyCount: number;
  results: Record<number, CreateResult>;
  priceDocs: PriceDocResult[];
  unpriced: number;
  pendingDecisions: number;
  running: boolean;
  pricing: boolean;
  progress: { done: number; total: number; stage: string };
  onCreate: () => void;
  onPriceNow: () => void;
}

const NomenCreatePanel = ({
  items,
  readyCount,
  results,
  priceDocs,
  unpriced,
  pendingDecisions,
  running,
  pricing,
  progress,
  onCreate,
  onPriceNow,
}: Props) => {
  const [confirm, setConfirm] = useState(false);
  const list = Object.values(results);
  const created = list.filter((r) => r.state === "created");
  const exists = list.filter((r) => r.state === "exists");
  const conflicts = list.filter((r) => r.state === "conflict");
  const failed = list.filter((r) => r.state === "error");
  const shown = list.filter((r) => r.state !== "conflict");
  const nameOf = (idx: number) => items.find((x) => x.idx === idx)?.name || "";
  const lastDoc = priceDocs[priceDocs.length - 1];

  return (
    <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
      <div className="font-semibold flex items-center gap-2">
        <Icon name="PackagePlus" size={18} className="text-primary" />
        4. Создание в 1С
      </div>
      <p className="text-xs text-muted-foreground">
        Перед созданием сайт сверяет артикул и наименование с 1С. Совпали оба — карточка уже есть, не
        создаётся. Совпал только один — позиция уходит в «Нужно решение». Штрихкод записывается, только
        если его нет в 1С. Базовые цены — одним документом на все созданные.
      </p>

      {!running && !confirm && (
        <Button onClick={() => setConfirm(true)} disabled={readyCount === 0 || pricing}>
          <Icon name="PackagePlus" size={16} />
          Создать в 1С ({readyCount})
        </Button>
      )}
      {readyCount === 0 && !running && list.length === 0 && (
        <div className="text-xs text-amber-400">Заполните позиции в шаге 3 — создаются только готовые.</div>
      )}

      {confirm && !running && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
          <div className="text-sm">Создать в 1С до {readyCount} карточек? Отменить можно только вручную в 1С.</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setConfirm(false);
                onCreate();
              }}
            >
              Да, создать
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {(running || pricing) && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Icon name="Loader2" size={14} className="animate-spin" />
            {pricing ? "Устанавливаю базовые цены" : progress.stage}
            {!pricing && progress.total > 0 && ` · ${progress.done} из ${progress.total}`}
          </div>
          {!pricing && (
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {list.length > 0 && !running && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs rounded-md px-2 py-1 text-emerald-400 bg-emerald-500/10">
              Создано: {created.length}
            </span>
            {exists.length > 0 && (
              <span className="text-xs rounded-md px-2 py-1 text-muted-foreground bg-white/[0.06]">
                Уже есть в 1С: {exists.length}
              </span>
            )}
            {conflicts.length > 0 && (
              <span className="text-xs rounded-md px-2 py-1 text-amber-400 bg-amber-500/10">
                Нужно решение: {conflicts.length}
              </span>
            )}
            {failed.length > 0 && (
              <span className="text-xs rounded-md px-2 py-1 text-rose-400 bg-rose-500/10">
                Ошибки: {failed.length}
              </span>
            )}
          </div>

          {priceDocs.map((d, i) => (
            <div
              key={i}
              className={`text-xs rounded-lg border p-2 ${
                d.ok && d.posted ? "border-emerald-500/30 text-emerald-300" : "border-rose-500/30 text-rose-300"
              }`}
            >
              {d.ok
                ? `Установка цен № ${d.number}: ${d.lines} строк, ${
                    d.posted ? "проведена" : `не проведена — ${d.post_error}`
                  }`
                : `Цены не установлены: ${d.error}`}
            </div>
          ))}

          {unpriced > 0 && !pricing && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <div className="text-xs text-amber-200">
                Без базовой цены: {unpriced}.{" "}
                {pendingDecisions > 0
                  ? `Цены будут установлены, когда решите по всем позициям ниже: осталось ${pendingDecisions}.`
                  : lastDoc && !lastDoc.ok
                    ? "Документ цен не создался — попробуйте ещё раз."
                    : ""}
              </div>
              <Button size="sm" variant="outline" onClick={onPriceNow}>
                <Icon name="Tag" size={14} />
                Установить цены сейчас ({unpriced})
              </Button>
            </div>
          )}

          {shown.length > 0 && (
            <div className="rounded-lg border border-white/[0.08] divide-y divide-white/[0.06]">
              {shown.map((r) => (
                <div key={r.idx} className="p-2 text-xs">
                  <div className="flex items-start gap-2">
                    <Icon
                      name={r.state === "created" ? "CircleCheck" : r.state === "exists" ? "CircleMinus" : "CircleX"}
                      size={14}
                      className={`mt-0.5 shrink-0 ${
                        r.state === "created"
                          ? "text-emerald-400"
                          : r.state === "exists"
                            ? "text-muted-foreground"
                            : "text-rose-400"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-foreground">{nameOf(r.idx)}</div>
                      <div className="text-muted-foreground">
                        {r.state === "created" && `Создана: код 1С ${r.code}`}
                        {r.state === "exists" && `Уже есть в 1С: ${r.card?.code} — ${r.card?.name}`}
                        {r.state === "error" && r.error}
                      </div>
                      {r.barcode === "taken" && (
                        <div className="text-amber-400">
                          ШК не записан: он уже у карточки {r.barcode_owner?.code} — {r.barcode_owner?.name}
                        </div>
                      )}
                      {r.barcode === "error" && <div className="text-rose-400">ШК не записан: {r.barcode_error}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {failed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Исправьте позиции с ошибками в шаге 3 и нажмите «Создать в 1С» ещё раз — созданные повторно не
              создадутся.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default NomenCreatePanel;
