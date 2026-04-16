import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import DebugBadge from "@/components/DebugBadge";

const PRICING_URL = "https://functions.poehali.dev/8b1df5ee-7914-4801-aa0f-3bd851bdb4a0";
const WHOLESALERS_URL = "https://functions.poehali.dev/03df983f-e7e9-4cd5-9427-e61b88d1171f";
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";

const PRICE_FIELDS = [
  { value: "price_base", label: "Базовая цена" },
  { value: "price_retail", label: "Розничная цена" },
  { value: "price_wholesale", label: "Оптовая цена" },
  { value: "price_purchase", label: "Закупочная цена" },
];

const OPERATORS = [
  { value: "*", label: "×" },
  { value: "/", label: "÷" },
  { value: "+", label: "+" },
  { value: "-", label: "−" },
];

const CONDITION_OPERATORS = [
  { value: "<", label: "<" },
  { value: ">", label: ">" },
  { value: "=", label: "=" },
  { value: "<=", label: "≤" },
  { value: ">=", label: "≥" },
];

interface Rule {
  id: number;
  wholesaler_id: number;
  priority: number;
  filter_type: string;
  filter_value: string;
  price_field: string;
  formula: string;
  created_at: string;
  condition_price_field: string | null;
  condition_operator: string | null;
  condition_value: number | null;
}

interface FormulaStep {
  operator: string;
  value: string;
}

function parseFormula(formula: string): FormulaStep[] {
  const steps: FormulaStep[] = [];
  const regex = /([+\-*/])\s*([\d.]+)/g;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    steps.push({ operator: match[1], value: match[2] });
  }
  return steps.length ? steps : [{ operator: "/", value: "100" }, { operator: "*", value: "43" }];
}

function buildFormula(steps: FormulaStep[]): string {
  return steps.map((s) => `${s.operator} ${s.value}`).join(" ");
}

function calcPreview(price: number, steps: FormulaStep[]): number {
  let result = price;
  for (const s of steps) {
    const v = parseFloat(s.value) || 0;
    if (s.operator === "*") result *= v;
    else if (s.operator === "/") result = v ? result / v : 0;
    else if (s.operator === "+") result += v;
    else if (s.operator === "-") result -= v;
  }
  return Math.round(result * 100) / 100;
}

const PricingRulesEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = localStorage.getItem("auth_token") || "";
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [wholesalerName, setWholesalerName] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formGroup, setFormGroup] = useState("");
  const [formPriceField, setFormPriceField] = useState("price_base");
  const [formSteps, setFormSteps] = useState<FormulaStep[]>([{ operator: "/", value: "100" }, { operator: "*", value: "43" }]);
  const [condEnabled, setCondEnabled] = useState(false);
  const [condField, setCondField] = useState("price_base");
  const [condOp, setCondOp] = useState("<");
  const [condValue, setCondValue] = useState("");

  const loadRules = useCallback(async () => {
    const resp = await fetch(`${PRICING_URL}?wholesaler_id=${id}`, { headers: authHeaders });
    const data = await resp.json();
    if (resp.ok) setRules(data.items || []);
  }, [id]);

  useEffect(() => {
    const load = async () => {
      const [wResp, gResp] = await Promise.all([
        fetch(WHOLESALERS_URL, { headers: authHeaders }),
        fetch(`${PRODUCTS_URL}?distinct=product_group`, { headers: authHeaders }),
      ]);
      const wData = await wResp.json();
      const gData = await gResp.json();
      const w = (wData.items || []).find((x: { id: number }) => x.id === Number(id));
      if (w) setWholesalerName(w.name);
      setGroups(gData.groups || []);
      await loadRules();
      setLoading(false);
    };
    load();
  }, [id]);

  const saveRule = async () => {
    if (!formGroup) {
      toast({ title: "Выберите группу товаров", variant: "destructive" });
      return;
    }
    const formula = buildFormula(formSteps);
    const condData = condEnabled ? {
      condition_price_field: condField,
      condition_operator: condOp,
      condition_value: condValue ? parseFloat(condValue) : null,
    } : {
      condition_price_field: null,
      condition_operator: null,
      condition_value: null,
    };

    if (editingId) {
      await fetch(PRICING_URL, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ id: editingId, filter_value: formGroup, price_field: formPriceField, formula, ...condData }),
      });
    } else {
      await fetch(PRICING_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ wholesaler_id: Number(id), filter_value: formGroup, price_field: formPriceField, formula, ...condData }),
      });
    }
    setShowAdd(false);
    setEditingId(null);
    resetForm();
    await loadRules();
    toast({ title: editingId ? "Правило обновлено" : "Правило добавлено" });
  };

  const deleteRule = async (ruleId: number) => {
    await fetch(`${PRICING_URL}?id=${ruleId}`, { method: "DELETE", headers: authHeaders });
    await loadRules();
    toast({ title: "Правило удалено" });
  };

  const moveRule = async (index: number, direction: -1 | 1) => {
    const newRules = [...rules];
    const target = index + direction;
    if (target < 0 || target >= newRules.length) return;
    [newRules[index], newRules[target]] = [newRules[target], newRules[index]];
    await fetch(PRICING_URL, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ id: 0, action: "reorder", rules: newRules.map((r) => r.id) }),
    });
    await loadRules();
  };

  const startEdit = (rule: Rule) => {
    setFormGroup(rule.filter_value);
    setFormPriceField(rule.price_field);
    setFormSteps(parseFormula(rule.formula));
    setEditingId(rule.id);
    if (rule.condition_price_field && rule.condition_operator) {
      setCondEnabled(true);
      setCondField(rule.condition_price_field);
      setCondOp(rule.condition_operator);
      setCondValue(rule.condition_value != null ? String(rule.condition_value) : "");
    } else {
      setCondEnabled(false);
      setCondField("price_base");
      setCondOp("<");
      setCondValue("");
    }
    setShowAdd(true);
  };

  const resetForm = () => {
    setFormGroup("");
    setFormPriceField("price_base");
    setFormSteps([{ operator: "/", value: "100" }, { operator: "*", value: "43" }]);
    setCondEnabled(false);
    setCondField("price_base");
    setCondOp("<");
    setCondValue("");
  };

  const addStep = () => setFormSteps([...formSteps, { operator: "*", value: "" }]);
  const removeStep = (i: number) => setFormSteps(formSteps.filter((_, idx) => idx !== i));
  const updateStep = (i: number, field: "operator" | "value", val: string) => {
    const updated = [...formSteps];
    updated[i] = { ...updated[i], [field]: val };
    setFormSteps(updated);
  };

  const previewPrice = 1000;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка...</div>;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/pricing")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Ценообразование</h1>
            <p className="text-xs text-muted-foreground">{wholesalerName}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        <div className="p-4 rounded-xl border border-white/[0.08] bg-card mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="Shield" size={16} className="text-primary" />
            <span className="font-medium text-sm">Базовое правило</span>
          </div>
          <p className="text-xs text-muted-foreground">Для всех товаров используется <span className="text-primary font-medium">Оптовая цена</span> (price_wholesale)</p>
        </div>

        {rules.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Исключения (приоритет сверху вниз)</p>
            <DebugBadge id="PricingEdit:rulesList">
              <div className="space-y-2">
                {rules.map((rule, idx) => {
                  const steps = parseFormula(rule.formula);
                  const priceLabel = PRICE_FIELDS.find((p) => p.value === rule.price_field)?.label || rule.price_field;
                  const preview = calcPreview(previewPrice, steps);
                  return (
                    <div key={rule.id} className="p-3 rounded-xl border border-white/[0.08] bg-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">{rule.filter_value}</span>
                          </div>
                          {rule.condition_price_field && rule.condition_operator && rule.condition_value != null && (
                            <p className="text-xs text-orange-300 mb-0.5">
                              Условие: {PRICE_FIELDS.find((p) => p.value === rule.condition_price_field)?.label} {CONDITION_OPERATORS.find((o) => o.value === rule.condition_operator)?.label} {rule.condition_value}₽
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {priceLabel} {rule.formula}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Пример: {previewPrice}₽ → <span className="text-primary font-medium">{preview}₽</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveRule(idx, -1)} disabled={idx === 0}>
                            <Icon name="ChevronUp" size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveRule(idx, 1)} disabled={idx === rules.length - 1}>
                            <Icon name="ChevronDown" size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(rule)}>
                            <Icon name="Pencil" size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteRule(rule.id)}>
                            <Icon name="Trash2" size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </DebugBadge>
          </div>
        )}

        {showAdd ? (
          <div className="p-4 rounded-xl border border-primary/30 bg-card space-y-4">
            <p className="font-medium text-sm">{editingId ? "Редактировать исключение" : "Новое исключение"}</p>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Группа товаров</label>
              <DebugBadge id="PricingEdit:group">
                <Select value={formGroup} onValueChange={setFormGroup}>
                  <SelectTrigger><SelectValue placeholder="Выберите группу" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DebugBadge>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Источник цены</label>
              <DebugBadge id="PricingEdit:priceField">
                <Select value={formPriceField} onValueChange={setFormPriceField}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICE_FIELDS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DebugBadge>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={condEnabled}
                  onChange={(e) => setCondEnabled(e.target.checked)}
                  className="rounded"
                />
                Дополнительное условие (необязательно)
              </label>
              {condEnabled && (
                <div className="flex items-center gap-2 mt-2">
                  <Select value={condField} onValueChange={setCondField}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRICE_FIELDS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={condOp} onValueChange={setCondOp}>
                    <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPERATORS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={condValue}
                    onChange={(e) => setCondValue(e.target.value)}
                    placeholder="Сумма"
                    className="w-28"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Формула</label>
              <div className="space-y-2">
                {formSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <DebugBadge id={`PricingEdit:formulaOp[${i}]`}>
                      <Select value={step.operator} onValueChange={(v) => updateStep(i, "operator", v)}>
                        <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </DebugBadge>
                    <DebugBadge id={`PricingEdit:formulaVal[${i}]`} className="flex-1">
                      <Input
                        type="number"
                        value={step.value}
                        onChange={(e) => updateStep(i, "value", e.target.value)}
                        placeholder="Число"
                      />
                    </DebugBadge>
                    {formSteps.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removeStep(i)}>
                        <Icon name="X" size={14} />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="text-xs" onClick={addStep}>
                  <Icon name="Plus" size={12} className="mr-1" /> Добавить шаг
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white/[0.04]">
              <p className="text-xs text-muted-foreground">Превью: {PRICE_FIELDS.find((p) => p.value === formPriceField)?.label} = {previewPrice}₽</p>
              <p className="text-sm font-medium text-primary">
                Результат: {calcPreview(previewPrice, formSteps)}₽
              </p>
            </div>

            <div className="flex gap-2">
              <DebugBadge id="PricingEdit:saveBtn" className="flex-1">
                <Button className="w-full" onClick={saveRule}>
                  {editingId ? "Сохранить" : "Добавить"}
                </Button>
              </DebugBadge>
              <Button variant="outline" onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <DebugBadge id="PricingEdit:addBtn">
            <Button variant="outline" className="w-full" onClick={() => { resetForm(); setShowAdd(true); }}>
              <Icon name="Plus" size={16} className="mr-2" /> Добавить исключение
            </Button>
          </DebugBadge>
        )}
      </main>
    </div>
  );
};

export default PricingRulesEdit;