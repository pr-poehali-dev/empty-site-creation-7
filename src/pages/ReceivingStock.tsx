import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import MovePanel from "./receiving-stock/MovePanel";
import StockGroupRow from "./receiving-stock/StockGroupRow";
import {
  loadGroups,
  loadTotals,
  loadWarehouses,
  type StockGroup,
  type WarehouseTotal,
} from "./receiving-stock/stockApi";

const ReceivingStock = () => {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const from = sp.get("from") || "";

  /** Пришли из приёмки — возвращаемся в неё, а не в корень: иначе работа теряется. */
  const goBack = () =>
    navigate(
      from
        ? `/admin/receiving-daily?kind=${encodeURIComponent(from)}&resume=1`
        : "/admin/receipts"
    );

  const [warehouses, setWarehouses] = useState<{ key: string; name: string }[]>([]);
  const [totals, setTotals] = useState<WarehouseTotal[]>([]);
  const [active, setActive] = useState("");
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [stage, setStage] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadWarehouses()
      .then((d) => {
        if (!alive) return;
        setWarehouses(d.warehouses);
        if (d.warehouses.length === 0) {
          setStage("empty");
          return;
        }
        setActive(d.warehouses[0].name);
        setStage("ready");
      })
      .catch((e) => {
        if (!alive) return;
        setError((e as Error).message);
        setStage("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  const refreshTotals = useCallback(async () => {
    try {
      const d = await loadTotals();
      setTotals(d.totals);
    } catch {
      /* молча: цифры подтянутся при следующем действии */
    }
  }, []);

  const refreshGroups = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    try {
      const d = await loadGroups(active, query);
      setGroups(d.rows);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [active, query]);

  useEffect(() => {
    if (stage === "ready") refreshTotals();
  }, [stage, refreshTotals]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(refreshGroups, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [active, query, refreshGroups]);

  const reloadAll = useCallback(() => {
    refreshTotals();
    refreshGroups();
  }, [refreshTotals, refreshGroups]);

  const toggleUnit = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const switchWarehouse = (name: string) => {
    setActive(name);
    setSelected(new Set());
  };

  if (stage === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stage === "error" || stage === "empty") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon
            name={stage === "empty" ? "Lock" : "TriangleAlert"}
            size={32}
            className={`mx-auto mb-3 ${stage === "empty" ? "text-muted-foreground" : "text-amber-400"}`}
          />
          <p className="font-medium mb-1">
            {stage === "empty" ? "Склады вам не открыты" : "Не получилось открыть"}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {stage === "empty" ? "Обратитесь к владельцу" : error}
          </p>
          <Button onClick={goBack}>{from ? "В приёмку" : "К приёмкам"}</Button>
        </div>
      </div>
    );
  }

  const totalOf = (name: string) => totals.find((t) => t.name === name)?.qty ?? 0;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={goBack}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">Склады</h1>
            <p className="text-xs text-muted-foreground truncate">
              {active}: {totalOf(active)} шт.
            </p>
          </div>
          <Button
            variant={moveOpen ? "default" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => setMoveOpen((v) => !v)}
          >
            <Icon name="ArrowRightLeft" size={16} className="mr-1" />
            Перенос
          </Button>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          {warehouses.map((w) => (
            <button
              key={w.key}
              onClick={() => switchWarehouse(w.name)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                active === w.name
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                  : "border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              {w.name}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {totalOf(w.name)}
              </span>
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-4 flex-1 space-y-3">
        {moveOpen && (
          <MovePanel
            warehouses={warehouses}
            selected={selected}
            onDone={reloadAll}
            onClear={() => setSelected(new Set())}
          />
        )}

        <div className="relative">
          <Icon
            name="Search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Модель, бренд, группа или штрихкод"
            className="pl-9 h-11"
          />
          {busy && (
            <Icon
              name="Loader2"
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
            />
          )}
        </div>

        {selected.size > 0 && (
          <div className="rounded-lg bg-sky-500/10 border border-sky-500/25 px-3 py-2 flex items-center gap-2">
            <span className="text-xs flex-1">Отмечено: {selected.size}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelected(new Set())}
            >
              Снять
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-white/[0.08] bg-card divide-y divide-white/[0.06] overflow-hidden">
          {groups.length === 0 && !busy ? (
            <div className="px-4 py-10 text-center">
              <Icon
                name="PackageOpen"
                size={32}
                className="mx-auto mb-2 text-muted-foreground"
              />
              <p className="text-sm text-muted-foreground">
                {query ? "Ничего не нашли" : `На складе «${active}» пока пусто`}
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <StockGroupRow
                key={`${g.product_group}|${g.brand}|${g.model}`}
                group={g}
                warehouse={active}
                query={query}
                selected={selected}
                onToggle={toggleUnit}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default ReceivingStock;