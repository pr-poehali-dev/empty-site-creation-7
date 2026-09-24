import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import CheckDialog from "./receiving-daily/CheckDialog";
import DailyCounters from "./receiving-daily/DailyCounters";
import LastCheck from "./receiving-daily/LastCheck";
import SearchBox from "./receiving-daily/SearchBox";
import {
  closeReceiving,
  findCurrent,
  loadState,
  openReceiving,
  scanCode,
  undoCheck,
  type Counters,
  type DailyItem,
  type Receiving,
} from "./receiving-daily/dailyApi";

const KIND_TITLES: Record<string, string> = {
  kind_plain: "Рабочий товар без проверки",
  kind_check: "Рабочий товар с проверкой",
  kind_repair: "Товар под ремонт",
};

const EMPTY: Counters = { sale: 0, wipe: 0, repair: 0, scrap: 0, total: 0 };

const ReceivingDaily = () => {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const kind = sp.get("kind") || "";

  const [stage, setStage] = useState<"loading" | "ask" | "work" | "error">("loading");
  const [error, setError] = useState("");
  const [receiving, setReceiving] = useState<Receiving | null>(null);
  const [counters, setCounters] = useState<Counters>(EMPTY);
  const [items, setItems] = useState<DailyItem[]>([]);
  const [current, setCurrent] = useState<DailyItem | null>(null);
  const [last, setLast] = useState<DailyItem | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [notFound, setNotFound] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const goBack = () => navigate("/admin/receipts");

  useEffect(() => {
    if (!KIND_TITLES[kind]) {
      setError("Вид приёмки не указан");
      setStage("error");
      return;
    }
    let alive = true;
    findCurrent(kind)
      .then((d) => {
        if (!alive) return;
        if (d.found) {
          setReceiving(d.receiving);
          setCounters(d.counters);
          setItems(d.items);
          setStage("ask");
        } else {
          start();
        }
      })
      .catch((e) => {
        if (!alive) return;
        setError((e as Error).message);
        setStage("error");
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  const start = async () => {
    try {
      const r = await openReceiving(kind);
      setReceiving(r);
      setCounters(EMPTY);
      setItems([]);
      setStage("work");
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  };

  const refresh = useCallback(async (id: number) => {
    try {
      const d = await loadState(id);
      setCounters(d.counters);
      setItems(d.items);
    } catch {
      /* молча: счётчики подтянутся при следующем действии */
    }
  }, []);

  const takeItem = useCallback((item: DailyItem) => {
    setNotFound("");
    setCurrent(item);
  }, []);

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const r = await scanCode(code);
        if (r.found && r.item) {
          takeItem(r.item);
        } else {
          setCurrent(null);
          setNotFound(code);
        }
      } catch (e) {
        toast({ title: (e as Error).message, variant: "destructive" });
      }
    },
    [takeItem]
  );

  useBarcodeScanner({ enabled: stage === "work" && !current, onScan: handleScan });

  const afterCheck = (c: Counters, item: DailyItem) => {
    setCounters(c);
    setCurrent(null);
    setLast(item);
    if (receiving && listOpen) refresh(receiving.id);
  };

  const undoLast = async () => {
    if (!last || !receiving) return;
    setUndoing(true);
    try {
      const r = await undoCheck(last.id, receiving.id);
      setCounters(r.counters);
      setLast(null);
      if (listOpen) refresh(receiving.id);
      toast({ title: "Отменили" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setUndoing(false);
    }
  };

  const finish = async () => {
    if (!receiving) return;
    setClosing(true);
    try {
      await closeReceiving(receiving.id);
      toast({ title: "Приёмка закрыта" });
      goBack();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setClosing(false);
    }
  };

  const title = KIND_TITLES[kind] || "Приёмка";

  if (stage === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="TriangleAlert" size={32} className="mx-auto mb-3 text-amber-400" />
          <p className="font-medium mb-1">Не получилось открыть</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={goBack}>К приёмкам</Button>
        </div>
      </div>
    );
  }

  if (stage === "ask") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-6 max-w-sm w-full">
          <Icon name="History" size={28} className="mb-3 text-violet-400" />
          <p className="font-medium mb-1">У вас уже есть сегодня приёмка</p>
          <p className="text-sm text-muted-foreground mb-4">
            {title} · проверено единиц: {counters.total}
          </p>
          <div className="space-y-2">
            <Button className="w-full" onClick={() => setStage("work")}>
              Продолжить
            </Button>
            <Button variant="outline" className="w-full" onClick={start}>
              Создать новую
            </Button>
            <Button variant="ghost" className="w-full" onClick={goBack}>
              Назад
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goBack}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{title}</h1>
            <p className="text-xs text-muted-foreground truncate">
              Проверено: {counters.total}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            title="Склады и остатки"
            onClick={() => navigate("/admin/receiving-stock")}
          >
            <Icon name="Warehouse" size={18} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={closing}
            onClick={finish}
          >
            <Icon name="CheckCheck" size={16} className="mr-1" />
            Закончить
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-4 flex-1 space-y-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Icon name="ScanLine" size={20} className="text-emerald-400" />
          </div>
          <div className="text-sm">
            <div className="font-medium">Сканер готов</div>
            <div className="text-xs text-muted-foreground">
              Пикайте товар — или найдите вручную ниже
            </div>
          </div>
        </div>

        <SearchBox onPick={takeItem} />

        {notFound && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4">
            <div className="flex items-start gap-2">
              <Icon name="SearchX" size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm mb-1">Не нашли в загрузках</p>
                <p className="text-xs text-muted-foreground break-all mb-2">
                  Код: {notFound}
                </p>
                <p className="text-xs text-muted-foreground">
                  Либо загружен не тот файл, либо товар лишний. Создание такой единицы —
                  следующий шаг.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setNotFound("")}
              >
                <Icon name="X" size={16} />
              </Button>
            </div>
          </div>
        )}

        {last && !current && (
          <LastCheck item={last} busy={undoing} onUndo={undoLast} />
        )}

        <DailyCounters counters={counters} />

        <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
          <button
            className="w-full px-4 py-3 flex items-center gap-2 text-left"
            onClick={() => {
              const next = !listOpen;
              setListOpen(next);
              if (next && receiving) refresh(receiving.id);
            }}
          >
            <Icon name="List" size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium flex-1">Проверено в этой приёмке</span>
            <span className="text-xs text-muted-foreground">{counters.total}</span>
            <Icon
              name={listOpen ? "ChevronUp" : "ChevronDown"}
              size={16}
              className="text-muted-foreground"
            />
          </button>

          {listOpen && (
            <div className="border-t border-white/[0.06] divide-y divide-white/[0.06] max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground text-center">
                  Пока ничего не проверено
                </p>
              ) : (
                items.map((it) => (
                  <div key={it.id} className="px-4 py-2">
                    <div className="text-sm truncate">{it.tech_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.supplier_barcode}
                      {it.warehouse ? ` · ${it.warehouse}` : ""}
                      {it.invoice_weight ? ` · ${Number(it.invoice_weight)} кг` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {current && receiving && (
        <CheckDialog
          item={current}
          receivingId={receiving.id}
          onDone={afterCheck}
          onClose={() => setCurrent(null)}
        />
      )}
    </div>
  );
};

export default ReceivingDaily;