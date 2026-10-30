import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PriceFormula, { applySteps, FormulaStep, PRICE_FIELDS } from "@/components/invoices/PriceFormula";

interface Item {
  product_id: number;
  name: string;
  article: string;
  file_names: string[];
  file: Record<string, number[]>;
  created: boolean;
  rows: number;
  current: Record<string, number>;
}

interface Settings {
  field?: string;
  mode?: "ready" | "calc";
  file_source?: string;
  source?: string;
  steps?: FormulaStep[];
}

interface Props {
  url: string;
  headers: Record<string, string>;
  draftId: number;
  onFinish: () => void;
}

type Filter = "all" | "big" | "double" | "off";
const BIG = 20;
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }));
const ACC: Record<string, string> = {
  price_purchase: "закупочную", price_base: "базовую", price_retail: "розничную", price_wholesale: "оптовую",
};

const PriceStep = ({ url, headers, draftId, onFinish }: Props) => {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [sources, setSources] = useState<{ value: string; label: string }[]>([]);
  const [applied, setApplied] = useState<{ price_field: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [field, setField] = useState("price_purchase");
  const [mode, setMode] = useState<"ready" | "calc">("ready");
  const [fileSrc, setFileSrc] = useState("");
  const [source, setSource] = useState("file");
  const [steps, setSteps] = useState<FormulaStep[]>([{ operator: "*", value: "1.3" }]);
  const [manual, setManual] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [ask, setAsk] = useState<"save" | "revert" | null>(null);
  const [meta, setMeta] = useState({ file: "", supplier: "" });

  const post = useCallback(
    async (body: object) => {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Сервер не ответил");
      return d;
    },
    [url, headers],
  );

  const load = useCallback(
    async (first = false) => {
      setLoading(true);
      try {
        const d = await post({ action: "prices_preview", draft_id: draftId });
        setItems(d.items || []);
        setSources(d.sources || []);
        setApplied(d.applied || []);
        setMeta({ file: d.file_name || "", supplier: d.supplier_name || "" });
        if (first) {
          const s: Settings = d.settings || {};
          const srcs: string[] = (d.sources || []).map((x: { value: string }) => x.value);
          if (s.field) setField(s.field);
          if (s.mode) setMode(s.mode);
          setFileSrc(s.file_source && srcs.includes(s.file_source) ? s.file_source : srcs[0] || "");
          if (s.source) setSource(s.source);
          if (s.steps?.length) setSteps(s.steps);
        }
      } catch (e) {
        toast({ title: (e as Error).message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [post, draftId, toast],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  const filePrice = (it: Item) => {
    const l = it.file[fileSrc];
    return l?.length ? l[l.length - 1] : null;
  };

  const rows = useMemo(
    () =>
      items.map((it) => {
        const fp = filePrice(it);
        const base = mode === "ready" || source === "file" ? fp : it.current[source];
        const calc = base == null || (mode === "calc" && !base) ? null : mode === "ready" ? applySteps(base, []) : applySteps(base, steps);
        const m = manual[it.product_id];
        const value = m !== undefined && m !== "" ? Number(m.replace(",", ".")) : calc;
        const old = it.current[field] || 0;
        const diff = !it.created && old > 0 && value != null ? ((value - old) / old) * 100 : null;
        const big = diff != null && Math.abs(diff) > BIG;
        const double = (it.file[fileSrc]?.length || 0) > 1;
        const same = value != null && old === value;
        const on = value != null && value >= 0 && !same && (checked[it.product_id] ?? !big);
        return { it, fp, value, old, diff, big, double, same, on };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, mode, source, steps, manual, field, checked, fileSrc],
  );

  const counts = {
    all: rows.length,
    big: rows.filter((r) => r.big).length,
    double: rows.filter((r) => r.double).length,
    off: rows.filter((r) => !r.on).length,
  };
  const selected = rows.filter((r) => r.on);
  const fieldLabel = PRICE_FIELDS.find((f) => f.value === field)?.label || "Цена";
  const noPrice = rows.filter((r) => r.value != null && !r.old);
  const visible = rows.filter((r) => (filter === "all" ? true : filter === "big" ? r.big : filter === "double" ? r.double : !r.on));
  const sample = rows.find((r) => r.value != null);
  const appliedCount = applied.reduce((s, a) => s + a.count, 0);
  const srcLabel = sources.find((s) => s.value === fileSrc)?.label || "Цена из файла";
  const formulaSources = [
    { value: "file", label: `${srcLabel} из файла` },
    ...PRICE_FIELDS.map((f) => ({ value: f.value, label: `${f.label} в каталоге` })),
  ];

  const save = async () => {
    if (!selected.length) return;
    setSaving(true);
    try {
      const d = await post({
        action: "prices_apply",
        draft_id: draftId,
        price_field: field,
        items: selected.map((x) => ({ product_id: x.it.product_id, new_price: x.value })),
        settings: { field, mode, file_source: fileSrc, source, steps },
      });
      toast({ title: `Цены записаны: ${d.written}` });
      setManual({});
      setChecked({});
      await load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const revert = async () => {
    setSaving(true);
    try {
      const d = await post({ action: "prices_revert", draft_id: draftId });
      toast({ title: `Цены откачены: ${d.reverted}` });
      await load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    await post({ action: "finish_draft", draft_id: draftId }).catch(() => null);
    onFinish();
  };

  const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
    <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] p-0.5 bg-secondary w-fit">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 h-8 rounded-lg text-sm transition-colors ${value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-muted-foreground">Цены из каталога поставщика</div>
          {meta.file && (
            <div className="text-xs text-muted-foreground truncate">
              {meta.supplier ? `${meta.supplier} · ` : ""}
              {meta.file}
            </div>
          )}
        </div>

        {appliedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="text-sm flex-1 min-w-[200px]">
              Уже записаны цены:{" "}
              {applied.map((a) => `${PRICE_FIELDS.find((f) => f.value === a.price_field)?.label?.toLowerCase()} — ${a.count}`).join(", ")}
            </p>
            <Button variant="outline" size="sm" className="rounded-xl" disabled={saving} onClick={() => setAsk("revert")}>
              <Icon name="Undo2" size={14} />
              <span className="ml-2">Откатить цены</span>
            </Button>
          </div>
        )}

        {!loading && !sources.length && items.length > 0 && (
          <div className="text-xs text-amber-400">В файле нет колонки цены — можно только рассчитать от цены в каталоге.</div>
        )}

        <div className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Записать в цену:</span>
          <Seg value={field} options={PRICE_FIELDS.map((f) => [f.value, f.label] as [string, string])} onChange={(v) => { setField(v); setChecked({}); }} />
        </div>

        {sources.length > 1 && (
          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground">Цена из файла:</span>
            <Seg value={fileSrc} options={sources.map((s) => [s.value, s.label] as [string, string])} onChange={(v) => { setFileSrc(v); setChecked({}); }} />
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Цена:</span>
          <Seg
            value={mode}
            options={[["ready", "Готовая из файла"], ["calc", "Рассчитать"]]}
            onChange={(v) => { setMode(v); setChecked({}); }}
          />
        </div>

        {mode === "calc" && (
          <FormulaWithSources
            sources={formulaSources}
            source={source}
            steps={steps}
            onSource={(v) => { setSource(v); setChecked({}); }}
            onSteps={(s) => { setSteps(s); setChecked({}); }}
          />
        )}

        {sample && (
          <div className="rounded-lg bg-white/[0.04] p-3 text-sm">
            <p className="text-xs text-muted-foreground truncate">Пример: {sample.it.name}</p>
            <p>
              {mode === "calc"
                ? `${formulaSources.find((s) => s.value === source)?.label}: ${fmt(source === "file" ? sample.fp : sample.it.current[source])} → `
                : `${srcLabel} из файла: ${fmt(sample.fp)} → `}
              <span className="font-semibold text-primary">{fmt(sample.value)} ₽</span>
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          ["all", "Всего", counts.all, ""],
          ["big", `Изменение > ${BIG}%`, counts.big, "text-amber-400"],
          ["double", "Несколько цен", counts.double, "text-sky-400"],
          ["off", "Не будут записаны", counts.off, "text-rose-400"],
        ] as [Filter, string, number, string][]).map(([k, l, n, c]) => (
          <button
            key={k}
            onClick={() => setFilter(filter === k ? "all" : k)}
            className={`rounded-xl border p-3 text-left transition-colors ${filter === k ? "border-primary bg-white/[0.04]" : "border-white/[0.08] hover:bg-white/[0.03]"}`}
          >
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className={`text-xl font-semibold ${c}`}>{n}</p>
          </button>
        ))}
      </div>

      {!loading && items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setChecked(Object.fromEntries(rows.map((r) => [r.it.product_id, r.value != null])))}>
            <Icon name="CheckCheck" size={14} />
            <span className="ml-2">Отметить все</span>
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setChecked(Object.fromEntries(rows.map((r) => [r.it.product_id, r.value != null && !r.old])))}>
            <Icon name="CircleDashed" size={14} />
            <span className="ml-2">Только где нет цены ({noPrice.length})</span>
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Icon name="Loader" size={24} className="animate-spin mx-auto mb-2" />
          Загружаю цены
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">Нет сопоставленных товаров.</p>
      ) : (
        <div className="space-y-2">
          {visible.map(({ it, fp, value, old, diff, big, double, same, on }) => (
            <div
              key={it.product_id}
              className={`rounded-xl border p-3 ${big ? "border-amber-500/40 bg-amber-500/[0.05]" : "border-white/[0.08]"} ${on ? "" : "opacity-60"}`}
            >
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={on}
                  disabled={value == null || same}
                  onChange={(e) => setChecked({ ...checked, [it.product_id]: e.target.checked })}
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <p className="text-sm font-medium break-words">{it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.article ? `Арт. ${it.article}` : ""}
                      {it.created && <span className="text-emerald-400"> · новый товар</span>}
                      {it.rows > 1 && <span> · строк в файле: {it.rows}</span>}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm items-end">
                    <div>
                      <p className="text-[11px] text-muted-foreground">В файле</p>
                      <p>{fmt(fp)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground truncate">{fieldLabel} сейчас</p>
                      <p>{old ? fmt(old) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground truncate">{fieldLabel} новая</p>
                      <Input
                        inputMode="decimal"
                        value={manual[it.product_id] ?? (value == null ? "" : String(value))}
                        onChange={(e) => setManual({ ...manual, [it.product_id]: e.target.value })}
                        className="h-8 rounded-lg px-2"
                      />
                    </div>
                  </div>
                  {same && <p className="text-xs text-muted-foreground">Цена не меняется</p>}
                  {diff != null && !same && (
                    <p className={`text-xs ${big ? "text-amber-400" : "text-muted-foreground"}`}>
                      {diff > 0 ? "+" : ""}
                      {diff.toFixed(1)}%{big && " — большое изменение, проверьте"}
                    </p>
                  )}
                  {double && (
                    <p className="text-xs text-sky-400">
                      В файле {it.file[fileSrc].length} цены: {it.file[fileSrc].map(fmt).join(" и ")} — взята большая
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.08] bg-background/95 backdrop-blur p-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Button variant="outline" className="rounded-xl" disabled={saving} onClick={finish}>
            Завершить
          </Button>
          <Button className="rounded-xl flex-1" disabled={saving || !selected.length} onClick={() => setAsk("save")}>
            <Icon name={saving ? "Loader" : "Save"} size={16} className={saving ? "animate-spin" : ""} />
            <span className="ml-2">Записать цены ({selected.length})</span>
          </Button>
        </div>
      </div>

      <AlertDialog open={ask !== null} onOpenChange={(o) => !o && setAsk(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{ask === "revert" ? "Откатить цены?" : "Записать цены?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {ask === "revert"
                ? `Вернуть старые цены у ${appliedCount} товаров из этого файла.`
                : `Записать ${ACC[field] || ""} цену для ${selected.length} товаров.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={() => {
                const a = ask;
                setAsk(null);
                if (a === "revert") revert();
                else save();
              }}
            >
              {ask === "revert" ? "Откатить" : "Записать"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const FormulaWithSources = ({
  sources, source, steps, onSource, onSteps,
}: {
  sources: { value: string; label: string }[];
  source: string;
  steps: FormulaStep[];
  onSource: (v: string) => void;
  onSteps: (s: FormulaStep[]) => void;
}) => <PriceFormula source={source} steps={steps} onSource={onSource} onSteps={onSteps} sources={sources} />;

export default PriceStep;
