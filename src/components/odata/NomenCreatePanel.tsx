import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { CreateResult, NewItem, PriceDocResult } from "@/pages/odata/nomenApi";

interface Props {
  items: NewItem[];
  readyCount: number;
  results: Record<number, CreateResult>;
  priceDoc: PriceDocResult | null;
  running: boolean;
  progress: { done: number; total: number; stage: string };
  onCreate: () => void;
}

const NomenCreatePanel = ({ items, readyCount, results, priceDoc, running, progress, onCreate }: Props) => {
  const [confirm, setConfirm] = useState(false);
  const list = Object.values(results);
  const created = list.filter((r) => r.state === "created");
  const exists = list.filter((r) => r.state === "exists");
  const failed = list.filter((r) => r.state === "error");
  const bcFailed = created.filter((r) => r.barcode === "error");
  const nameOf = (idx: number) => items.find((x) => x.idx === idx)?.name || "";

  return (
    <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
      <div className="font-semibold flex items-center gap-2">
        <Icon name="PackagePlus" size={18} className="text-primary" />
        4. Создание в 1С
      </div>
      <p className="text-xs text-muted-foreground">
        По каждой готовой позиции: карточка номенклатуры → штрихкод → затем один документ «Установка
        цен номенклатуры» (тип «Базовая») на все созданные, с проведением. Перед созданием сайт ещё раз
        проверяет, что артикула и штрихкода в 1С нет.
      </p>

      {!running && !confirm && (
        <Button onClick={() => setConfirm(true)} disabled={readyCount === 0}>
          <Icon name="PackagePlus" size={16} />
          Создать в 1С ({readyCount})
        </Button>
      )}
      {readyCount === 0 && !running && list.length === 0 && (
        <div className="text-xs text-amber-400">Заполните позиции в шаге 3 — создаются только готовые.</div>
      )}

      {confirm && !running && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
          <div className="text-sm">
            Создать в 1С {readyCount} карточек и установить им базовые цены? Отменить можно только вручную в 1С.
          </div>
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

      {running && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Icon name="Loader2" size={14} className="animate-spin" />
            {progress.stage} {progress.total > 0 && `· ${progress.done} из ${progress.total}`}
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {list.length > 0 && !running && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs rounded-md px-2 py-1 text-emerald-400 bg-emerald-500/10">
              Создано: {created.length}
            </span>
            {exists.length > 0 && (
              <span className="text-xs rounded-md px-2 py-1 text-amber-400 bg-amber-500/10">
                Уже были в 1С: {exists.length}
              </span>
            )}
            {failed.length > 0 && (
              <span className="text-xs rounded-md px-2 py-1 text-rose-400 bg-rose-500/10">
                Ошибки: {failed.length}
              </span>
            )}
          </div>

          {priceDoc && (
            <div
              className={`text-xs rounded-lg border p-2 ${
                priceDoc.ok && priceDoc.posted
                  ? "border-emerald-500/30 text-emerald-300"
                  : "border-rose-500/30 text-rose-300"
              }`}
            >
              {priceDoc.ok
                ? `Установка цен № ${priceDoc.number}: ${priceDoc.lines} строк, ${
                    priceDoc.posted ? "проведена" : `не проведена — ${priceDoc.post_error}`
                  }`
                : `Цены не установлены: ${priceDoc.error}`}
            </div>
          )}

          <div className="rounded-lg border border-white/[0.08] divide-y divide-white/[0.06]">
            {list.map((r) => (
              <div key={r.idx} className="p-2 text-xs">
                <div className="flex items-start gap-2">
                  <Icon
                    name={r.state === "created" ? "CircleCheck" : r.state === "exists" ? "CircleMinus" : "CircleX"}
                    size={14}
                    className={`mt-0.5 shrink-0 ${
                      r.state === "created"
                        ? "text-emerald-400"
                        : r.state === "exists"
                          ? "text-amber-400"
                          : "text-rose-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-foreground">{nameOf(r.idx)}</div>
                    <div className="text-muted-foreground">
                      {r.state === "created" && `Код 1С ${r.code} · арт. ${r.article}`}
                      {r.state === "exists" && `Уже есть: ${r.card?.code} — ${r.card?.name}`}
                      {r.state === "error" && r.error}
                    </div>
                    {r.barcode === "error" && (
                      <div className="text-rose-400">Штрихкод не записан: {r.barcode_error}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {(failed.length > 0 || bcFailed.length > 0) && (
            <p className="text-xs text-muted-foreground">
              Исправьте позиции с ошибками в шаге 3 и нажмите «Создать в 1С» ещё раз — уже созданные
              повторно не создадутся.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default NomenCreatePanel;
