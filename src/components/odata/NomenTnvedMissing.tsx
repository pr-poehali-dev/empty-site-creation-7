import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { createTnvedCodes } from "@/pages/odata/nomenApi";

interface Props {
  base: string;
  missing: { code: string; count: number }[];
  checking: boolean;
  onCreated: (map: Record<string, string>) => void;
}

const NomenTnvedMissing = ({ base, missing, checking, onCreated }: Props) => {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  if (!missing.length && !progress) return null;

  const run = async () => {
    setBusy(true);
    setError("");
    let queue = missing.map((m) => m.code);
    const total = queue.length;
    let done = 0;
    let idle = 0;
    try {
      while (queue.length) {
        setProgress(`Создано ${done} из ${total}`);
        const portion = queue.slice(0, 20);
        const r = await createTnvedCodes(base, portion);
        const got = { ...r.already, ...r.created };
        done += Object.keys(got).length;
        onCreated(got);
        queue = [...r.remaining, ...queue.slice(20)];
        idle = Object.keys(got).length ? 0 : idle + 1;
        if (idle >= 3) {
          setError("1С не создаёт коды — остановился. Нажмите ещё раз, созданные повторно не создадутся");
          break;
        }
      }
      setProgress(`Создано ${done} из ${total}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-semibold flex items-center gap-2 flex-1">
          <Icon name="BookPlus" fallback="FilePlus" size={18} className="text-amber-400" />
          Коды ТН ВЭД, которых нет в 1С · {missing.length}
        </div>
        {missing.length > 0 && (
          <Button size="sm" onClick={run} disabled={busy || checking}>
            <Icon name={busy ? "Loader2" : "Upload"} size={14} className={busy ? "animate-spin" : ""} />
            Создать в 1С
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Коды из файла, которых нет в справочнике «Классификатор ТН ВЭД». Создаются так же, как вручную: наименование
        = код, единица «шт». Пока код не создан, карточки с ним не создаются.
      </p>
      {missing.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {missing.map((m) => (
            <span key={m.code} className="text-xs rounded-md bg-white/[0.06] px-2 py-1 tabular-nums">
              {m.code} <span className="text-muted-foreground">· {m.count} тов.</span>
            </span>
          ))}
        </div>
      )}
      {progress && <div className="text-xs text-emerald-400">{progress}</div>}
      {error && <div className="text-xs text-rose-400 whitespace-pre-line">{error}</div>}
    </section>
  );
};

export default NomenTnvedMissing;
