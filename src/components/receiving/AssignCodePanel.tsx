import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import CameraScanButton from "@/components/receiving/CameraScanButton";
import {
  assignCode,
  lookupSupplier,
  replaceCode,
  samePosition,
  searchPositions,
  type Position,
} from "@/lib/barcodeFix";

type Target = Position & {
  name: string;
  units: number;
  codes: string[];
  via: string;
};

interface Props {
  /** Заводской код, который присваиваем. */
  code: string;
  place: string;
  /** Позиции, за которыми код числится сейчас — при переносе код у них убирается. */
  moveFrom?: (Position & { name?: string; units?: number })[];
  /** Сканер слушает только когда окно на переднем плане. */
  scannerEnabled: boolean;
  onCameraOpen?: () => void;
  onDone: (updated: number) => void;
  /** Сейчас идёт подтверждение — родитель прячет остальное. */
  onConfirmChange?: (open: boolean) => void;
}

const unitsText = (n: number) => `${n} шт.`;

/**
 * Присвоение заводского кода товару: по этикетке поставщика, по заказ-наряду
 * или выбором из списка. Код добавляется к уже имеющимся кодам позиции.
 * Если код числится за другим товаром — переносим его оттуда.
 */
const AssignCodePanel = ({
  code,
  place,
  moveFrom = [],
  scannerEnabled,
  onCameraOpen,
  onDone,
  onConfirmChange,
}: Props) => {
  const [supplierValue, setSupplierValue] = useState("");
  const [orderValue, setOrderValue] = useState("");
  const [lookBusy, setLookBusy] = useState<"" | "supplier" | "order">("");
  const [notFound, setNotFound] = useState<"" | "supplier" | "order">("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Target[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTargetState] = useState<Target | null>(null);
  const [saving, setSaving] = useState(false);
  const [dropFrom, setDropFrom] = useState<Set<number>>(
    () => new Set(moveFrom.map((_, i) => i))
  );

  const setTarget = (t: Target | null) => {
    setTargetState(t);
    onConfirmChange?.(Boolean(t));
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchPositions(q)
        .then((d) => alive && setRows(d.rows.map((r) => ({ ...r, via: "из списка" }))))
        .catch(() => alive && setRows([]))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const lookup = async (raw: string, by: "supplier" | "order") => {
    const c = raw.trim();
    if (!c) return;
    if (by === "supplier") setSupplierValue(c);
    else setOrderValue(c);
    setNotFound("");
    setLookBusy(by);
    try {
      const r = await lookupSupplier(c, by);
      if (!r.found || !r.item) {
        setNotFound(by);
        return;
      }
      setTarget({
        product_group: r.item.product_group,
        brand: r.item.brand,
        model: r.item.model,
        name: r.item.name,
        units: r.item.units,
        codes: r.item.codes,
        via: by === "supplier" ? `по этикетке ${c}` : `по заказ-наряду ${c}`,
      });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setLookBusy("");
    }
  };

  useBarcodeScanner({
    enabled: scannerEnabled && !target && !saving,
    onScan: (c) => lookup(c, "supplier"),
  });

  const sources = moveFrom.filter((p) => !target || !samePosition(p, target));
  const chosenFrom = sources.filter((p) => dropFrom.has(moveFrom.indexOf(p)));

  const doAssign = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const r = await assignCode(code, target, chosenFrom);
      if (r.already) toast({ title: "У этого товара код уже есть" });
      else if (r.moved_from)
        toast({ title: `Код перенесён на товар: ${r.updated} шт.` });
      else toast({ title: `Код добавлен товару: ${r.updated} шт.` });
      onDone(r.updated);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setSaving(false);
    }
  };

  const doReplace = async (old: string) => {
    setSaving(true);
    try {
      const r = await replaceCode(old, code, "supplier");
      toast({ title: `Код заменён: ${r.updated} шт.` });
      onDone(r.updated);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setSaving(false);
    }
  };

  if (target) {
    const has = target.codes.includes(code);
    const others = target.codes.filter((c) => c !== code);
    return (
      <div className="space-y-3">
        <p className="text-base font-semibold">
          {sources.length > 0 ? "Перенести код на этот товар?" : "Присвоить код этому товару?"}
        </p>
        <div className="rounded-xl bg-white/[0.04] p-3 space-y-1.5 text-sm">
          <div className="break-words font-medium">{target.name || "без наименования"}</div>
          <div className="text-xs text-muted-foreground">
            {target.via} · {unitsText(target.units)}
          </div>
          <div className="font-mono text-[15px] text-emerald-300 break-all pt-1">{code}</div>
        </div>

        {has && (
          <p className="text-sm text-emerald-300 flex items-start gap-1.5">
            <Icon name="CircleCheck" size={16} className="shrink-0 mt-0.5" />
            У этого товара такой код уже записан
          </p>
        )}

        {!has && others.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-3 space-y-1.5">
            <p className="text-sm text-amber-200 flex items-start gap-1.5">
              <Icon name="TriangleAlert" size={16} className="shrink-0 mt-0.5" />
              У товара уже есть заводской код. Убедитесь, что выбрали верный товар.
            </p>
            {others.map((c) => (
              <div key={c} className="font-mono text-sm break-all">
                {c}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Новый код добавится к имеющимся — у товара их может быть несколько.
            </p>
          </div>
        )}

        {sources.length > 0 && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3 space-y-2">
            <p className="text-sm">Сейчас этот код записан у товара — убрать его оттуда:</p>
            {sources.map((p) => {
              const i = moveFrom.indexOf(p);
              const on = dropFrom.has(i);
              return (
                <button
                  key={i}
                  onClick={() =>
                    setDropFrom((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className="w-full text-left flex items-start gap-2 rounded-lg bg-black/20 px-2.5 py-2"
                >
                  <Icon
                    name={on ? "SquareCheck" : "Square"}
                    size={18}
                    className={`shrink-0 mt-0.5 ${on ? "text-sky-300" : "text-muted-foreground"}`}
                  />
                  <span className="text-sm break-words">
                    {p.name || [p.product_group, p.brand, p.model].join(" ")}
                    {p.units ? ` · ${unitsText(p.units)}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {(!has || chosenFrom.length > 0) && (
            <Button className="w-full h-11" disabled={saving} onClick={doAssign}>
              {saving ? (
                <Icon name="Loader2" size={16} className="animate-spin" />
              ) : chosenFrom.length > 0 ? (
                "Перенести код"
              ) : others.length > 0 ? (
                "Добавить к имеющимся"
              ) : (
                "Присвоить код"
              )}
            </Button>
          )}
          {!has && others.length === 1 && sources.length === 0 && (
            <Button
              variant="outline"
              className="w-full h-11 border-white/[0.1]"
              disabled={saving}
              onClick={() => doReplace(others[0])}
            >
              Заменить {others[0]} на новый
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full h-10"
            disabled={saving}
            onClick={() => setTarget(null)}
          >
            Назад
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Icon name="Tag" size={15} className="text-sky-300" />
          Пикните этикетку поставщика
        </p>
        <div className="flex gap-2">
          <Input
            value={supplierValue}
            onChange={(e) => {
              setSupplierValue(e.target.value);
              setNotFound("");
            }}
            onKeyDown={(e) => e.key === "Enter" && lookup(supplierValue, "supplier")}
            placeholder="Штрихкод поставщика"
            className="h-11"
          />
          <CameraScanButton
            fieldKey={`assign_supplier_${place}`}
            onCode={(c) => lookup(c, "supplier")}
            onOpen={onCameraOpen}
          />
          <Button
            className="h-11 px-4"
            disabled={!supplierValue.trim() || Boolean(lookBusy)}
            onClick={() => lookup(supplierValue, "supplier")}
          >
            <Icon
              name={lookBusy === "supplier" ? "Loader2" : "Search"}
              size={18}
              className={lookBusy === "supplier" ? "animate-spin" : ""}
            />
          </Button>
        </div>
        {notFound === "supplier" && (
          <p className="text-xs text-amber-200">Этикетка поставщика не найдена в загрузках</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Icon name="ClipboardList" size={15} className="text-sky-300" />
          Или введите заказ-наряд
        </p>
        <div className="flex gap-2">
          <Input
            value={orderValue}
            onChange={(e) => {
              setOrderValue(e.target.value);
              setNotFound("");
            }}
            onKeyDown={(e) => e.key === "Enter" && lookup(orderValue, "order")}
            placeholder="Номер заказ-наряда"
            className="h-11"
          />
          <Button
            className="h-11 px-4"
            disabled={!orderValue.trim() || Boolean(lookBusy)}
            onClick={() => lookup(orderValue, "order")}
          >
            <Icon
              name={lookBusy === "order" ? "Loader2" : "Search"}
              size={18}
              className={lookBusy === "order" ? "animate-spin" : ""}
            />
          </Button>
        </div>
        {notFound === "order" && (
          <p className="text-xs text-amber-200">Такого заказ-наряда нет в загрузках</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Icon name="ListFilter" size={15} className="text-sky-300" />
          Или выберите товар из списка
        </p>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Группа, бренд или модель"
          className="h-11"
        />
        {searching && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Icon name="Loader2" size={14} className="animate-spin" />
            Ищу...
          </div>
        )}
        {!searching && query.trim().length >= 2 && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Ничего не нашлось</p>
        )}
        {rows.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-1 rounded-xl border border-white/[0.08] p-1">
            {rows.map((r, i) => (
              <button
                key={i}
                onClick={() => setTarget(r)}
                className="w-full text-left rounded-lg hover:bg-white/[0.05] px-2.5 py-2"
              >
                <div className="text-sm break-words">{r.name || "без наименования"}</div>
                <div className="text-xs text-muted-foreground">
                  {unitsText(r.units)}
                  {r.codes.length > 0
                    ? ` · код: ${r.codes.slice(0, 2).join(", ")}${r.codes.length > 2 ? "…" : ""}`
                    : " · без кода"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssignCodePanel;
