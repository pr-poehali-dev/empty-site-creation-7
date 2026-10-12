import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@/components/ui/icon";
import { BarcodeState, BarcodeWriteResult } from "@/pages/odata/nomenApi";
import { BC_META } from "./NomenMatchTable";

interface Props {
  counts: Record<BarcodeState, number>;
  writing: boolean;
  progress: { done: number; total: number };
  results: BarcodeWriteResult[] | null;
  onWrite: (includeOther: boolean) => void;
}

const ORDER: BarcodeState[] = ["ok", "none", "other", "taken", "no_invoice", "error"];

const NomenBarcodePanel = ({ counts, writing, progress, results, onWrite }: Props) => {
  const [includeOther, setIncludeOther] = useState(false);
  const toWrite = counts.none + (includeOther ? counts.other : 0);

  const added = results?.filter((r) => r.state === "added").length || 0;
  const failed = results?.filter((r) => r.state !== "added" && r.state !== "exists") || [];

  return (
    <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
      <div className="font-semibold flex items-center gap-2">
        <Icon name="Barcode" size={18} className="text-primary" />
        Штрихкоды у найденных карточек
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} className={`text-xs rounded-md px-2 py-1 ${BC_META[s].cls}`}>
            {BC_META[s].label}: {counts[s]}
          </span>
        ))}
      </div>
      {counts.taken > 0 && (
        <p className="text-xs text-muted-foreground">
          «ШК занят» — штрихкод из счёта уже записан у другой карточки. 1С его не примет, такие
          строки пропускаются.
        </p>
      )}
      {counts.other > 0 && (
        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            checked={includeOther}
            disabled={writing}
            onCheckedChange={(v) => setIncludeOther(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            И тем, у кого другой ШК ({counts.other})
            <span className="block text-xs text-muted-foreground">
              Штрихкод из счёта добавится к карточке, старый останется
            </span>
          </span>
        </label>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => onWrite(includeOther)} disabled={writing || toWrite === 0}>
          <Icon
            name={writing ? "Loader2" : "Barcode"}
            fallback="Plus"
            size={16}
            className={writing ? "animate-spin" : ""}
          />
          Добавить штрихкоды в 1С ({toWrite})
        </Button>
        {writing && (
          <span className="text-sm text-muted-foreground">
            Записано {progress.done} из {progress.total}
          </span>
        )}
      </div>
      {results && !writing && (
        <div className="text-sm space-y-1">
          <div className="text-emerald-400">Записано: {added}</div>
          {failed.length > 0 && (
            <div className="space-y-1">
              <div className="text-rose-400">Не записано: {failed.length}</div>
              {failed.map((r) => (
                <div key={r.key + r.barcode} className="text-xs text-muted-foreground">
                  {r.barcode}:{" "}
                  {r.state === "taken"
                    ? `уже у карточки ${r.owner?.code} — ${r.owner?.name}`
                    : r.error || "ошибка"}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default NomenBarcodePanel;
