import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import {
  ProblemRow,
  GtdFix,
  isRussia,
  gtdKind,
} from "@/pages/odata/gtdFix";

interface Props {
  problems: ProblemRow[];
  fixes: Record<number, GtdFix>;
  onChange: (fixes: Record<number, GtdFix>) => void;
  onApply: () => void;
  busy?: boolean;
}

const GtdFixCard = ({ problems, fixes, onChange, onApply, busy }: Props) => {
  const [open, setOpen] = useState(true);
  if (!problems.length) return null;

  const setCountry = (p: ProblemRow, country: string) => {
    const russia = isRussia(country);
    const number = russia ? "" : p.hintNumber;
    onChange({ ...fixes, [p.index]: { country, number } });
  };

  const setNumber = (p: ProblemRow, number: string) => {
    const cur = fixes[p.index] || { country: "", number: "" };
    onChange({ ...fixes, [p.index]: { ...cur, number } });
  };

  const done = problems.filter((p) => fixes[p.index]?.country).length;
  const allDone = problems.every((p) => {
    const f = fixes[p.index];
    return f && f.country && (isRussia(f.country) || gtdKind(f.number));
  });

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Icon name="TriangleAlert" size={18} className="text-amber-400" />
        <span className="flex-1 text-sm font-medium text-amber-200">
          Строки с непонятным номером: {problems.length}
          {done > 0 && ` · уточнено ${done}`}
        </span>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs opacity-70">
            В этих строках файл съехал. Укажите страну — если не Россия,
            номер подставится из строки с тем же артикулом.
          </p>

          {problems.map((p) => {
            const f = fixes[p.index];
            const russia = f ? isRussia(f.country) : false;
            return (
              <div
                key={p.index}
                className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2"
              >
                <div className="text-sm font-medium">
                  {p.name || p.article}
                </div>
                <div className="text-xs opacity-60 break-all">
                  Артикул {p.article || "—"} · в файле: «{p.rawGtd}»
                  {p.rawCountry && ` · страна «${p.rawCountry}»`}
                </div>

                <div className="flex flex-wrap gap-2">
                  {p.hintCountry && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => setCountry(p, p.hintCountry)}
                    >
                      {p.hintCountry}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    onClick={() => setCountry(p, "РОССИЯ")}
                  >
                    Россия
                  </Button>
                  <Input
                    value={f?.country || ""}
                    onChange={(e) => setCountry(p, e.target.value)}
                    placeholder="Страна"
                    className="h-8 w-36 rounded-lg text-xs"
                  />
                </div>

                {f?.country && !russia && (
                  <div className="space-y-1">
                    <Input
                      value={f.number}
                      onChange={(e) => setNumber(p, e.target.value)}
                      placeholder="Номер ГТД или РНПТ"
                      className="h-8 rounded-lg text-xs font-mono"
                    />
                    {f.number && !gtdKind(f.number) && (
                      <div className="text-xs text-red-300">
                        Не похоже на номер: нужно три части для ГТД или
                        четыре для РНПТ
                      </div>
                    )}
                    {!f.number && (
                      <div className="text-xs text-amber-300">
                        {p.conflict
                          ? "У этого артикула в файле разные номера — впишите нужный"
                          : "Не нашёл номер по артикулу — впишите вручную"}
                      </div>
                    )}
                  </div>
                )}

                {f?.country && russia && (
                  <div className="text-xs text-emerald-300">
                    Российский товар — номер не нужен
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-1">
            <Button
              onClick={onApply}
              disabled={busy || !allDone}
              size="sm"
              className="w-full rounded-lg gap-2"
            >
              {busy ? (
                <Icon name="Loader2" size={15} className="animate-spin" />
              ) : (
                <Icon name="Check" size={15} />
              )}
              Применить и перепроверить
            </Button>
            {!allDone && (
              <div className="mt-1 text-xs opacity-60">
                Укажите страну и номер во всех строках
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GtdFixCard;