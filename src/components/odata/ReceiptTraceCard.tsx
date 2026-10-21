import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import TestCard from "@/components/odata/TestCard";
import ResultBox from "@/components/odata/ResultBox";
import { TracePlan, TraceReport, countryCode } from "@/pages/odata/receiptTrace";

const yn = (v: boolean) => (v ? "да" : "нет");

interface Props {
  plan: TracePlan | null;
  busy: boolean;
  progress: string;
  error: string;
  apply: boolean;
  onApply: (v: boolean) => void;
  onCheck: () => void;
  disabled: boolean;
  report: TraceReport | null;
}

const List = ({ title, lines, tone }: { title: string; lines: string[]; tone: string }) =>
  lines.length ? (
    <div className="mt-3">
      <div className={`text-sm font-medium ${tone}`}>
        {title}: {lines.length}
      </div>
      <div className="mt-1 max-h-60 overflow-y-auto rounded-lg border border-white/[0.08] divide-y divide-white/[0.06]">
        {lines.map((l, i) => (
          <div key={i} className="px-3 py-1.5 text-xs break-words">
            {l}
          </div>
        ))}
      </div>
    </div>
  ) : null;

const ReceiptTraceCard = ({ plan, busy, progress, error, apply, onApply, onCheck, disabled, report }: Props) => (
  <TestCard
    title="Страна и признак в карточках"
    icon="Globe"
    description="Сверяю страну и «Прослеживаемый» в карточках с УПД: РНПТ — да, ГТД — нет"
  >
    <Button onClick={onCheck} disabled={disabled || busy} size="sm" className="rounded-lg gap-2">
      <Icon name={busy ? "Loader2" : "ScanSearch"} size={15} className={busy ? "animate-spin" : ""} />
      Проверить карточки
    </Button>
    {disabled && <p className="text-xs text-muted-foreground mt-2">Сначала проверьте товары в 1С</p>}
    {progress && <p className="text-xs text-muted-foreground mt-2">{progress}</p>}
    {error && <ResultBox ok={false} title="Не удалось проверить" details={error} />}

    {plan && (
      <>
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            plan.diffs.length || plan.create.length
              ? "border-amber-500/30 bg-amber-500/[0.07]"
              : "border-emerald-500/30 bg-emerald-500/[0.07]"
          }`}
        >
          Проверено карточек: {plan.checked}. Исправить: {plan.diffs.length}. Создать стран: {plan.create.length}.
        </div>
        <List
          title="Будет исправлено"
          tone="text-amber-400"
          lines={plan.diffs.map((d) =>
            [
              `${d.article} · ${d.name}`,
              d.countryDiff
                ? `страна: ${d.fromCountry || "пусто"} → ${d.toCountry}${d.toCountryKey ? "" : countryCode(d.toCountry) ? " (создам)" : " (нет в 1С)"}`
                : "",
              d.toTrace !== undefined ? `прослеживаемый: ${yn(d.fromTrace)} → ${yn(d.toTrace)}` : "",
            ]
              .filter(Boolean)
              .join(" · "),
          )}
        />
        <List
          title="Не трогаю — разные данные в УПД"
          tone="text-muted-foreground"
          lines={plan.conflicts.map((c) => `${c.article} · ${c.name} · ${c.reason}`)}
        />
        <List
          title="Будут созданы страны"
          tone="text-primary"
          lines={plan.create.map((c) => `${c.name} · код ${c.code}`)}
        />
        <List
          title="Код страны не найден — не создам"
          tone="text-rose-400"
          lines={plan.noCode.map((n) => `${n} · строки уйдут без страны`)}
        />
        {(plan.diffs.length > 0 || plan.create.length > 0) && (
          <label className="mt-3 flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={apply}
              onChange={(e) => onApply(e.target.checked)}
            />
            <span>Исправить карточки и создать страны при создании поступления</span>
          </label>
        )}
      </>
    )}

    {report && (
      <>
        <List
          title="Страна обновлена"
          tone="text-emerald-400"
          lines={report.countryChanged.map((x) => `${x.name} · ${x.from || "пусто"} → ${x.to}`)}
        />
        <List
          title="Признак изменён"
          tone="text-emerald-400"
          lines={report.traceChanged.map((x) => `${x.name} · ${yn(x.from)} → ${yn(x.to)}`)}
        />
        <List
          title="Созданы страны"
          tone="text-emerald-400"
          lines={report.created.map((x) => `${x.name} · код ${x.code}`)}
        />
        <List title="Не удалось" tone="text-rose-400" lines={report.failed.map((x) => `${x.name} · ${x.reason}`)} />
      </>
    )}
  </TestCard>
);

export default ReceiptTraceCard;
