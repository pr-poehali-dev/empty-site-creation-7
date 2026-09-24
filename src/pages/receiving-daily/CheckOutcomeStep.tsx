import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import type { Outcome } from "./dailyApi";

interface Props {
  busy: boolean;
  onPick: (
    outcome: Outcome,
    defects?: { defect_confirmed: boolean; new_defect: boolean; new_defect_text: string }
  ) => void;
}

const BUTTONS: {
  key: Outcome;
  title: string;
  hint: string;
  icon: string;
  cls: string;
}[] = [
  {
    key: "sale",
    title: "Рабочее, на продажу",
    hint: "склад СГП",
    icon: "CircleCheck",
    cls: "border-emerald-500/30 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.16] text-emerald-300",
  },
  {
    key: "wipe",
    title: "Рабочее, на протирку",
    hint: "склад Протирка",
    icon: "Sparkles",
    cls: "border-sky-500/30 bg-sky-500/[0.08] hover:bg-sky-500/[0.16] text-sky-300",
  },
  {
    key: "repair",
    title: "Не работает",
    hint: "склад Под ремонт",
    icon: "Wrench",
    cls: "border-amber-500/30 bg-amber-500/[0.08] hover:bg-amber-500/[0.16] text-amber-300",
  },
  {
    key: "scrap",
    title: "Утиль",
    hint: "восстановлению не подлежит",
    icon: "Trash2",
    cls: "border-rose-500/30 bg-rose-500/[0.08] hover:bg-rose-500/[0.16] text-rose-300",
  },
];

/** Четыре исхода. У «не работает» — уточнение по дефектам, оно нужно для претензии поставщику. */
const CheckOutcomeStep = ({ busy, onPick }: Props) => {
  const [repair, setRepair] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [text, setText] = useState("");

  if (repair) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setRepair(false)}
          >
            <Icon name="ArrowLeft" size={16} />
          </Button>
          <p className="font-semibold">Что с дефектом?</p>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3 cursor-pointer">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">Заявленный дефект подтвердился</span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3 cursor-pointer">
          <Checkbox
            checked={isNew}
            onCheckedChange={(v) => setIsNew(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">Нашли новый дефект</span>
        </label>

        {isNew && (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что именно нашли"
            rows={3}
          />
        )}

        <Button
          className="w-full h-12"
          disabled={busy || (isNew && !text.trim())}
          onClick={() =>
            onPick("repair", {
              defect_confirmed: confirmed,
              new_defect: isNew,
              new_defect_text: text.trim(),
            })
          }
        >
          {busy ? (
            <Icon name="Loader2" size={18} className="animate-spin" />
          ) : (
            "Под ремонт"
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-semibold text-center mb-1">Что с товаром?</p>
      {BUTTONS.map((b) => (
        <button
          key={b.key}
          disabled={busy}
          onClick={() => (b.key === "repair" ? setRepair(true) : onPick(b.key))}
          className={`w-full rounded-xl border p-3.5 flex items-center gap-3 text-left transition-colors disabled:opacity-50 ${b.cls}`}
        >
          <Icon name={b.icon} size={22} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-base font-semibold leading-tight">
              {b.title}
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {b.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
};

export default CheckOutcomeStep;
