import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import {
  LOOK_TITLES,
  OUTCOME_WAREHOUSE,
  TRACE_TITLES,
  fixWipe,
  wipeDone,
  wipeFix,
  type Counters,
  type DailyItem,
  type WipeStatus,
} from "./dailyApi";

interface Props {
  item: DailyItem;
  status: WipeStatus;
  receivingId: number;
  onDone: (counters: Counters, item: DailyItem) => void;
  onClose: () => void;
  /** Режим «Исправление ошибки»: новый итог по уже обработанной единице. */
  fix?: boolean;
  onFixed?: () => void;
}

const dt = (v?: string | null) =>
  v
    ? new Date(String(v).replace(" ", "T")).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const OUT_TEXT: Record<string, string> = {
  sale: "в СГП",
  wipe: "на протирку",
  repair: "в ремонт",
  scrap: "в утиль",
};

const master = (it: DailyItem) =>
  `Мастер ${it.checked_by_name || "—"}${it.checked_at ? `, ${dt(it.checked_at)}` : ""}`;

const Big = ({
  onClick,
  cls,
  icon,
  text,
  disabled,
}: {
  onClick: () => void;
  cls: string;
  icon: string;
  text: string;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full h-16 rounded-xl text-lg font-semibold flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50 ${cls}`}
  >
    <Icon name={icon} size={22} />
    {text}
  </button>
);

/** Окно протирки: что делать с единицей решает решение мастера, а не склад. */
const WipeDialog = ({
  item: start,
  status: startStatus,
  receivingId,
  onDone,
  onClose,
  fix = false,
  onFixed,
}: Props) => {
  const [item, setItem] = useState(start);
  // В исправлении обработанная единица идёт по обычным шагам «Готово/Утиль».
  const [status, setStatus] = useState<WipeStatus>(fix && startStatus === "done" ? "ready" : startStatus);
  const [step, setStep] = useState<"choose" | "look" | "traces">("choose");
  const [look, setLook] = useState("");
  const [busy, setBusy] = useState(false);

  const fix = async () => {
    setBusy(true);
    try {
      const r = await wipeFix(receivingId, item.id);
      setItem(r.item);
      setStatus(r.status);
      toast({ title: "Решение мастера исправлено на «Протирку»" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const save = async (result: "sale" | "scrap", traces?: string) => {
    setBusy(true);
    if (fix) {
      try {
        await fixWipe(receivingId, item.id, result, look || undefined, traces);
        toast({ title: "Итог исправлен" });
        onFixed?.();
      } catch (e) {
        toast({ title: (e as Error).message, variant: "destructive" });
        setBusy(false);
      }
      return;
    }
    try {
      const r = await wipeDone(receivingId, item.id, result, look || undefined, traces);
      onDone(r.counters, {
        ...item,
        wipe_result: result,
        wipe_look: result === "sale" ? look : null,
        wipe_traces: result === "sale" ? traces : null,
      });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setBusy(false);
    }
  };

  const blocked = status === "unchecked" || status === "repair" || status === "scrap";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div
        className={`w-full sm:max-w-md bg-card sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto ${
          fix ? "border-4 border-amber-400" : "border-t sm:border border-white/[0.1]"
        }`}
      >
        {fix && (
          <div className="bg-amber-400 text-amber-950 text-center text-sm font-bold py-1.5">
            ИСПРАВЛЕНИЕ ОШИБКИ
          </div>
        )}
        <div className="px-4 py-3 border-b border-white/[0.08] flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] leading-4 break-words">{item.tech_name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {item.supplier_barcode}
              {item.warehouse ? ` · сейчас: ${item.warehouse}` : ""}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose}>
            <Icon name="X" size={18} />
          </Button>
        </div>

        <div className="p-4 space-y-3">
          {blocked && (
            <>
              <div className="rounded-xl border-2 border-rose-500 bg-rose-950/40 p-4 space-y-1">
                <div className="flex items-center gap-2 text-rose-200 font-semibold">
                  <Icon name="OctagonAlert" size={20} />
                  {status === "unchecked" ? "Товар не прошёл проверку" : "Товар не для протирки"}
                </div>
                {status !== "unchecked" && (
                  <p className="text-sm">
                    {master(item)}, отправил {OUT_TEXT[status]}.
                  </p>
                )}
                <p className="text-sm font-medium">Передайте товар мастеру.</p>
              </div>
              <Button className="w-full h-12" onClick={onClose}>
                Понятно
              </Button>
            </>
          )}

          {status === "done" && (
            <>
              <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 p-4 space-y-1">
                <div className="font-semibold text-sky-200">Уже обработан протиркой</div>
                <p className="text-sm">
                  {item.wipe_by_name || "—"}
                  {item.wipe_local || item.wipe_at ? `, ${dt(item.wipe_local || item.wipe_at)}` : ""}
                </p>
                <p className="text-sm">
                  {item.wipe_result === "scrap"
                    ? "Утиль"
                    : `Готово, ${(LOOK_TITLES[item.wipe_look || ""] || "").toLowerCase()}, ${(
                        TRACE_TITLES[item.wipe_traces || ""] || ""
                      ).toLowerCase()}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Исправить можно будет в режиме «Исправление ошибки».
                </p>
              </div>
              <Button className="w-full h-12" onClick={onClose}>
                Понятно
              </Button>
            </>
          )}

          {status === "sale" && (
            <>
              <div className="rounded-xl border-2 border-amber-500 bg-amber-950/30 p-4 space-y-1">
                <div className="flex items-center gap-2 text-amber-200 font-semibold">
                  <Icon name="TriangleAlert" size={20} />
                  Не на протирке
                </div>
                <p className="text-sm">
                  {master(item)}, отправил {OUT_TEXT.sale}.
                </p>
                <p className="text-sm text-muted-foreground">Сейчас: {item.warehouse || "—"}</p>
              </div>
              <Big
                onClick={fix}
                disabled={busy}
                cls="bg-sky-500 text-sky-950 hover:bg-sky-400"
                icon="Sparkles"
                text="Переместить на протирку"
              />
              <Button variant="ghost" className="w-full" onClick={onClose}>
                Отмена
              </Button>
            </>
          )}

          {status === "ready" && step === "choose" && (
            <>
              {fix && item.wipe_result && (
                <div className="rounded-lg bg-amber-500/15 border border-amber-500/30 p-2.5 text-xs text-amber-100">
                  Сейчас: {item.wipe_by_name || "—"}
                  {item.wipe_local || item.wipe_at ? `, ${dt(item.wipe_local || item.wipe_at)}` : ""} —{" "}
                  <b>
                    {item.wipe_result === "scrap"
                      ? "Утиль"
                      : `Готово, ${(LOOK_TITLES[item.wipe_look || ""] || "").toLowerCase()}, ${(
                          TRACE_TITLES[item.wipe_traces || ""] || ""
                        ).toLowerCase()}`}
                  </b>
                  . Выберите заново — прежний итог сохранится в истории.
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {master(item)}, отправил {OUT_TEXT[item.check_result || "wipe"]}
                {item.master_fixed_from
                  ? ` (исправлено протиркой: было ${OUTCOME_WAREHOUSE[item.master_fixed_from] || item.master_fixed_from})`
                  : ""}
              </div>
              <Big
                onClick={() => setStep("look")}
                disabled={busy}
                cls="bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                icon="CircleCheck"
                text="Готово"
              />
              <Big
                onClick={() => save("scrap")}
                disabled={busy}
                cls="bg-rose-500/90 text-white hover:bg-rose-500"
                icon="Trash2"
                text="Утиль"
              />
            </>
          )}

          {status === "ready" && step === "look" && (
            <>
              <div className="text-sm font-medium">Внешний вид</div>
              {Object.entries(LOOK_TITLES).map(([k, t]) => (
                <Big
                  key={k}
                  onClick={() => {
                    setLook(k);
                    setStep("traces");
                  }}
                  cls="bg-white/[0.06] text-foreground hover:bg-white/[0.1] border border-white/[0.1]"
                  icon="Eye"
                  text={t}
                />
              ))}
              <Button variant="ghost" className="w-full" onClick={() => setStep("choose")}>
                Назад
              </Button>
            </>
          )}

          {status === "ready" && step === "traces" && (
            <>
              <div className="text-sm font-medium">
                Следы · <span className="text-muted-foreground">{LOOK_TITLES[look]}</span>
              </div>
              <Big
                onClick={() => save("sale", "none")}
                disabled={busy}
                cls="bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 border border-emerald-500/40"
                icon="Sparkle"
                text={TRACE_TITLES.none}
              />
              <Big
                onClick={() => save("sale", "used")}
                disabled={busy}
                cls="bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 border border-amber-500/40"
                icon="Hand"
                text={TRACE_TITLES.used}
              />
              <Button variant="ghost" className="w-full" onClick={() => setStep("look")}>
                Назад
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WipeDialog;
