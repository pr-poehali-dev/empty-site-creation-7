import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { NewItem, RETRIES, createTnvedCodes } from "@/pages/odata/nomenApi";

export interface TnvedStep {
  stage: "" | "check" | "create" | "similar";
  done: number;
  total: number;
  retry: number;
}

interface Props {
  base: string;
  items: NewItem[];
  fileCodes: string[];
  found: Record<string, string>;
  missing: { code: string; count: number }[];
  failed: string[];
  similarTotal: number;
  similarDone: number;
  similarItems: number;
  kindsFailed: string[];
  step: TnvedStep;
  setStep: React.Dispatch<React.SetStateAction<TnvedStep>>;
  onCheck: () => void;
  onCreated: (map: Record<string, string>) => void;
  onApply: () => void;
  onSimilar: () => void;
}

const CREATE_PORTION = 10;

const Bar = ({ done, total }: { done: number; total: number }) => (
  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
    <div className="h-full bg-primary transition-all" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
  </div>
);

const Row = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="space-y-2 p-4">
    <div className="text-sm font-medium flex items-center gap-2">
      <span className="h-5 w-5 rounded-full bg-white/[0.08] text-xs flex items-center justify-center">{n}</span>
      {title}
    </div>
    <div className="space-y-2 text-xs text-muted-foreground">{children}</div>
  </div>
);

const NomenTnvedSteps = (p: Props) => {
  const { step } = p;
  const [createError, setCreateError] = useState("");
  const busy = step.stage !== "";
  const checked = p.fileCodes.filter((c) => p.found[c] || p.missing.some((m) => m.code === c)).length;
  const inOneC = p.fileCodes.filter((c) => p.found[c]).length;
  const allChecked = p.fileCodes.length > 0 && checked + p.failed.length >= p.fileCodes.length && !p.failed.length;
  const withFile = p.items.filter((x) => x.fileTnved).length;
  const applied = p.items.filter((x) => x.fileTnved && x.tnved === x.fileTnved && x.tnvedKey).length;
  const canApply = allChecked && p.missing.length === 0 && inOneC > 0;
  const retryNote = step.retry ? `нет ответа, повтор ${step.retry} из ${RETRIES}` : "";

  const createMissing = async () => {
    setCreateError("");
    const codes = p.missing.map((m) => m.code);
    p.setStep({ stage: "create", done: 0, total: codes.length, retry: 0 });
    const bad: string[] = [];
    for (let i = 0; i < codes.length; i += CREATE_PORTION) {
      const part = codes.slice(i, i + CREATE_PORTION);
      try {
        const r = await createTnvedCodes(p.base, part, (a) => p.setStep((s) => ({ ...s, retry: a })));
        p.onCreated({ ...r.already, ...r.created });
        if (r.error) bad.push(r.error);
      } catch (e) {
        bad.push(`${part.join(", ")}: ${(e as Error).message}`);
      }
      p.setStep((s) => ({ ...s, done: s.done + part.length, retry: 0 }));
    }
    setCreateError(bad.join("\n"));
    p.setStep((s) => ({ ...s, stage: "" }));
  };

  return (
    <section className="rounded-xl border border-white/[0.08] bg-card divide-y divide-white/[0.06]">
      <div className="p-4 font-semibold flex items-center gap-2">
        <Icon name="ListChecks" size={18} className="text-primary" />
        Коды ТН ВЭД
      </div>

      <Row n={1} title="Сверка кодов из файла со справочником 1С">
        {p.fileCodes.length === 0 ? (
          <p>В файле нет кодов ТН ВЭД — переходите к подбору по похожим.</p>
        ) : (
          <>
            <p>
              Кодов в файле {p.fileCodes.length} (у {withFile} товаров) · сверено {checked} из {p.fileCodes.length} · есть
              в 1С <span className="text-emerald-400">{inOneC}</span> · нет в 1С{" "}
              <span className={p.missing.length ? "text-amber-400" : ""}>{p.missing.length}</span>
              {p.failed.length > 0 && <span className="text-rose-400"> · не сверено {p.failed.length}</span>}
            </p>
            {step.stage === "check" && (
              <>
                <Bar done={step.done} total={step.total} />
                <p>
                  Сверяю {step.done} из {step.total}
                  {retryNote && <span className="text-amber-400"> · {retryNote}</span>}
                </p>
              </>
            )}
            {!allChecked && (
              <Button size="sm" onClick={p.onCheck} disabled={busy}>
                <Icon name={step.stage === "check" ? "Loader2" : "SearchCheck"} size={14} className={step.stage === "check" ? "animate-spin" : ""} />
                {p.failed.length ? "Дозагрузить" : "Проверить ТН ВЭД из файла"}
              </Button>
            )}
          </>
        )}
      </Row>

      {p.fileCodes.length > 0 && (
        <Row n={2} title="Коды ТН ВЭД, которых нет в 1С">
          {!allChecked ? (
            <p>Сначала сверьте коды.</p>
          ) : p.missing.length === 0 ? (
            <p className="text-emerald-400">Все коды из файла есть в 1С.</p>
          ) : (
            <>
              <p>Создаются как вручную: наименование = код, единица «шт». Повторно не создаются.</p>
              <div className="flex flex-wrap gap-1.5">
                {p.missing.map((m) => (
                  <span key={m.code} className="rounded-md bg-white/[0.06] px-2 py-1 tabular-nums text-foreground">
                    {m.code} <span className="text-muted-foreground">· {m.count} тов.</span>
                  </span>
                ))}
              </div>
              {step.stage === "create" && (
                <>
                  <Bar done={step.done} total={step.total} />
                  <p>
                    Создано {step.done} из {step.total}
                    {retryNote && <span className="text-amber-400"> · {retryNote}</span>}
                  </p>
                </>
              )}
              <Button size="sm" onClick={createMissing} disabled={busy}>
                <Icon name={step.stage === "create" ? "Loader2" : "Upload"} size={14} className={step.stage === "create" ? "animate-spin" : ""} />
                Создать в 1С · {p.missing.length}
              </Button>
            </>
          )}
          {createError && <p className="text-rose-400 whitespace-pre-line">{createError}</p>}
        </Row>
      )}

      {p.fileCodes.length > 0 && (
        <Row n={3} title="Проставить коды из файла в товары">
          <p>
            Проставлено {applied} из {withFile}
            {!canApply && allChecked && p.missing.length > 0 && (
              <span className="text-amber-400"> · сначала создайте {p.missing.length} кодов в 1С</span>
            )}
          </p>
          <Button size="sm" variant="outline" onClick={p.onApply} disabled={busy || !canApply || applied === withFile}>
            <Icon name="ArrowDownToLine" size={14} />
            Проставить коды из файла
          </Button>
        </Row>
      )}

      <Row n={p.fileCodes.length ? 4 : 2} title="Подбор по похожим в 1С">
        <p>
          Только для товаров без кода или веса в файле: {p.similarItems} товаров, {p.similarTotal} типов · подобрано{" "}
          {p.similarDone} из {p.similarTotal}
          {p.kindsFailed.length > 0 && <span className="text-rose-400"> · не загрузилось {p.kindsFailed.length}</span>}
        </p>
        {step.stage === "similar" && (
          <>
            <Bar done={step.done} total={step.total} />
            <p>
              Подбираю {step.done} из {step.total} типов
              {retryNote && <span className="text-amber-400"> · {retryNote}</span>}
            </p>
          </>
        )}
        {p.similarTotal > 0 && p.similarDone < p.similarTotal && (
          <Button size="sm" variant="outline" onClick={p.onSimilar} disabled={busy}>
            <Icon name={step.stage === "similar" ? "Loader2" : "Sparkles"} size={14} className={step.stage === "similar" ? "animate-spin" : ""} />
            {p.kindsFailed.length ? "Дозагрузить" : "Подобрать по похожим"}
          </Button>
        )}
      </Row>
    </section>
  );
};

export default NomenTnvedSteps;
