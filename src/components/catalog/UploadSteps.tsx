import Icon from "@/components/ui/icon";

export type UploadStep = 1 | 2 | 3 | 4;

const STEPS: { n: UploadStep; t: string }[] = [
  { n: 1, t: "Файл" },
  { n: 2, t: "Товары" },
  { n: 3, t: "Штрихкоды" },
  { n: 4, t: "Цены" },
];

const UploadSteps = ({ step }: { step: UploadStep }) => (
  <div className="flex items-center gap-1 sm:gap-2">
    {STEPS.map((s, i) => {
      const done = s.n < step;
      const cur = s.n === step;
      return (
        <div key={s.n} className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
          <div
            className={`flex items-center gap-2 rounded-xl px-2 sm:px-3 py-2 flex-1 min-w-0 text-sm border ${
              cur
                ? "border-primary bg-primary/10 text-primary"
                : done
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-white/[0.08] bg-secondary text-muted-foreground"
            }`}
          >
            <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs bg-white/10">
              {done ? <Icon name="Check" size={12} /> : s.n}
            </span>
            <span className="truncate">{s.t}</span>
          </div>
          {i < STEPS.length - 1 && (
            <Icon name="ChevronRight" size={14} className="text-muted-foreground shrink-0" />
          )}
        </div>
      );
    })}
  </div>
);

export default UploadSteps;
