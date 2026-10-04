import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import { authHeaders, SEARCH_DICTS_URL } from "@/components/search-dicts/api";
import PriceFormula, { applySteps, FormulaStep, PRICE_FIELDS, SOURCES } from "./PriceFormula";

interface PriceItem {
  product_id: number;
  name: string;
  article: string;
  invoice_names: string[];
  prices: number[];
  invoice_price: number | null;
  qty: number;
  created: boolean;
  current: Record<string, number>;
}

interface Applied {
  price_field: string;
  count: number;
}

interface Props {
  draftId: number;
  onBack: () => void;
}

type Filter = "all" | "big" | "double" | "off";

const BIG = 20;
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }));

const InvoicePrices = ({ draftId, onBack }: Props) => {
  const { toast } = useToast();
  const [items, setItems] = useState<PriceItem[]>([]);
  const [applied, setApplied] = useState<Applied[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [field, setField] = useState("price_purchase");
  const [mode, setMode] = useState<"ready" | "calc">("ready");
  const [source, setSource] = useState("invoice");
  const [steps, setSteps] = useState<FormulaStep[]>([{ operator: "*", value: "1.3" }]);
  const [manual, setManual] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${SEARCH_DICTS_URL}?section=prices&draft_id=${draftId}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setItems(d.items || []);
      setApplied(d.applied || []);
      if (d.price_field) setField(d.price_field);
      if (d.price_mode) setMode(d.price_mode);
    } catch (e) {
      toast({ title: (e as Error).message || "Не удалось загрузить цены", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [draftId]);

  const rows = useMemo(() => items.map((it) => {
    const base = mode === "ready" || source === "invoice" ? it.invoice_price : it.current[source];
    const calc = base == null || (mode === "calc" && !base) ? null : mode === "ready" ? applySteps(base, []) : applySteps(base, steps);
    const m = manual[it.product_id];
    const value = m !== undefined && m !== "" ? Number(m.replace(",", ".")) : calc;
    const old = it.current[field] || 0;
    const diff = !it.created && old > 0 && value != null ? ((value - old) / old) * 100 : null;
    const big = diff != null && Math.abs(diff) > BIG;
    const double = it.prices.length > 1;
    const on = value != null && value >= 0 && (checked[it.product_id] ?? !big);
    return { it, value, old, diff, big, double, on };
  }), [items, mode, source, steps, manual, field, checked]);

  const counts = {
    all: rows.length,
    big: rows.filter((r) => r.big).length,
    double: rows.filter((r) => r.double).length,
    off: rows.filter((r) => !r.on).length,
  };
  const selected = rows.filter((r) => r.on);
  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "big" ? r.big : filter === "double" ? r.double : !r.on);

  const sample = rows.find((r) => r.value != null);
  const fieldLabel = PRICE_FIELDS.find((f) => f.value === field)?.label || field;
  const appliedCount = applied.reduce((s, a) => s + a.count, 0);

  const save = async () => {
    if (!selected.length) return;
    if (!confirm(`Записать ${fieldLabel.toLowerCase()} цену для ${selected.length} товаров?`)) return;
    setSaving(true);
    try {
      const r = await fetch(`${SEARCH_DICTS_URL}?section=prices`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          draft_id: draftId,
          price_field: field,
          price_mode: mode,
          items: selected.map((x) => ({ product_id: x.it.product_id, new_price: x.value })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: `Цены записаны: ${d.written}` });
      setManual({});
      setChecked({});
      await load();
    } catch (e) {
      toast({ title: (e as Error).message || "Не удалось записать цены", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const revert = async () => {
    if (!confirm(`Вернуть старые цены у ${appliedCount} товаров из этого счёта?`)) return;
    setSaving(true);
    try {
      const r = await fetch(`${SEARCH_DICTS_URL}?section=prices&draft_id=${draftId}`, { method: "DELETE", headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: `Цены откачены: ${d.reverted}` });
      await load();
    } catch (e) {
      toast({ title: (e as Error).message || "Не удалось откатить", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <Icon name="ArrowLeft" size={20} />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Цены из счёта</h2>
          <p className="text-sm text-muted-foreground">Товаров: {items.length}</p>
        </div>
      </div>

      {appliedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm flex-1 min-w-[200px]">
            Из этого счёта уже записаны цены: {applied.map((a) => `${PRICE_FIELDS.find((f) => f.value === a.price_field)?.label?.toLowerCase()} — ${a.count}`).join(", ")}
          </p>
          <Button variant="outline" size="sm" className="rounded-xl" disabled={saving} onClick={revert}>
            <Icon name="Undo2" size={14} />
            <span className="ml-2">Откатить цены</span>
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] p-3 space-y-3">
        <div className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Записать в цену:</span>
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] p-0.5 bg-secondary w-fit">
            {PRICE_FIELDS.map((f) => (
              <button
                key={f.value}
                onClick={() => { setField(f.value); setChecked({}); }}
                className={`px-3 h-8 rounded-lg text-sm transition-colors ${field === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Цена:</span>
          <div className="inline-flex rounded-xl border border-white/[0.08] p-0.5 bg-secondary">
            {([["ready", "Готовая из счёта"], ["calc", "Рассчитать"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => { setMode(v); setChecked({}); }}
                className={`px-3 h-8 rounded-lg text-sm transition-colors ${mode === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {mode === "calc" && (
          <PriceFormula source={source} steps={steps} onSource={(v) => { setSource(v); setChecked({}); }} onSteps={(s) => { setSteps(s); setChecked({}); }} />
        )}

        {sample && (
          <div className="rounded-lg bg-white/[0.04] p-3 text-sm">
            <p className="text-xs text-muted-foreground truncate">Пример: {sample.it.name}</p>
            <p>
              {mode === "calc"
                ? `${SOURCES.find((s) => s.value === source)?.label}: ${fmt(source === "invoice" ? sample.it.invoice_price : sample.it.current[source])} → `
                : `Цена из счёта: ${fmt(sample.it.invoice_price)} → `}
              <span className="font-semibold text-primary">{fmt(sample.value)} ₽</span>
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          ["all", "Всего", counts.all, ""],
          ["big", `Изменение > ${BIG}%`, counts.big, "text-amber-400"],
          ["double", "Две цены в счёте", counts.double, "text-sky-400"],
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

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Icon name="Loader" size={24} className="animate-spin mx-auto mb-2" />
          Загружаю цены
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">Нет сопоставленных товаров — сначала найдите их в каталоге.</p>
      ) : (
        <div className="space-y-2">
          {visible.map(({ it, value, old, diff, big, double, on }) => (
            <div
              key={it.product_id}
              className={`rounded-xl border p-3 ${big ? "border-amber-500/40 bg-amber-500/[0.05]" : "border-white/[0.08]"} ${on ? "" : "opacity-60"}`}
            >
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={on}
                  disabled={value == null}
                  onChange={(e) => setChecked({ ...checked, [it.product_id]: e.target.checked })}
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <p className="text-sm font-medium break-words">{it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.article ? `Арт. ${it.article} · ` : ""}{fmt(it.qty)} шт
                      {it.created && <span className="text-emerald-400"> · новый товар</span>}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm items-end">
                    <div>
                      <p className="text-[11px] text-muted-foreground">В счёте</p>
                      <p>{fmt(it.invoice_price)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Сейчас</p>
                      <p>{it.created ? "—" : fmt(old)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Новая</p>
                      <Input
                        inputMode="decimal"
                        value={manual[it.product_id] ?? (value == null ? "" : String(value))}
                        onChange={(e) => setManual({ ...manual, [it.product_id]: e.target.value })}
                        className="h-8 rounded-lg px-2"
                      />
                    </div>
                  </div>
                  {diff != null && (
                    <p className={`text-xs ${big ? "text-amber-400" : "text-muted-foreground"}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(1)}%{big && " — большое изменение, проверьте"}
                    </p>
                  )}
                  {double && (
                    <p className="text-xs text-sky-400">В счёте {it.prices.length} цены: {it.prices.map(fmt).join(" и ")} — взята большая</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.08] bg-background/95 backdrop-blur p-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Записать: {selected.length}</p>
            <Button className="rounded-xl" disabled={saving || !selected.length} onClick={save}>
              <Icon name={saving ? "Loader" : "Save"} size={16} className={saving ? "animate-spin" : ""} />
              <span className="ml-2">Записать цены ({selected.length})</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePrices;
