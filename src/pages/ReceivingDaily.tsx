import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useReceivingPerms } from "@/hooks/useReceivingPerms";
import CheckDialog from "./receiving-daily/CheckDialog";
import DailyCounters, { counterTitle } from "./receiving-daily/DailyCounters";
import FinishDialog from "./receiving-daily/FinishDialog";
import ItemRow from "./receiving-daily/ItemRow";
import LastCheck from "./receiving-daily/LastCheck";
import PastReceivings from "./receiving-daily/PastReceivings";
import SearchBox from "./receiving-daily/SearchBox";
import Stopwatch, { STOPWATCH_KEY, stopwatchOn } from "./receiving-daily/Stopwatch";
import WipeDialog from "./receiving-daily/WipeDialog";
import {
  KIND_TITLES,
  closeReceiving,
  findCurrent,
  loadState,
  markTaken,
  openReceiving,
  receivingDate,
  receivingTimes,
  removeItem,
  scanCode,
  undoCheck,
  WIPE_KIND,
  wipeScan,
  wipeUndo,
  type WipeStatus,
  type Counters,
  type DailyItem,
  type Receiving,
} from "./receiving-daily/dailyApi";

const EMPTY: Counters = { sale: 0, wipe: 0, repair: 0, scrap: 0, total: 0 };
const FACTORY_RESUME_KEY = "receiving_factory_resume";

const ReceivingDaily = () => {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const kind = sp.get("kind") || "";
  const isWipe = kind === WIPE_KIND;

  const [stage, setStage] = useState<"loading" | "start" | "work" | "done" | "error">("loading");
  const [starting, setStarting] = useState(false);
  const [takenAt, setTakenAt] = useState(0);
  const [swOn, setSwOn] = useState(stopwatchOn);
  const [finished, setFinished] = useState<Counters>(EMPTY);
  const [error, setError] = useState("");
  const [receiving, setReceiving] = useState<Receiving | null>(null);
  const [counters, setCounters] = useState<Counters>(EMPTY);
  const [items, setItems] = useState<DailyItem[]>([]);
  const [current, setCurrent] = useState<DailyItem | null>(null);
  const [wipeStatus, setWipeStatus] = useState<WipeStatus>("ready");
  const [last, setLast] = useState<DailyItem | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [notFound, setNotFound] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [result, setResult] = useState("");
  const resultRef = useRef("");
  resultRef.current = result;
  const [closing, setClosing] = useState(false);
  const [askFinish, setAskFinish] = useState(false);
  const [removingId, setRemovingId] = useState(0);
  const [resumeFactory, setResumeFactory] = useState(false);
  const loaded = useRef(false);
  const { can } = useReceivingPerms();
  const canRemove = can("item_remove");

  // Пометка «назад»: у кого один вид приёмки, страница приёмок не кинет его обратно сюда.
  const goBack = () => navigate("/admin/receipts", { state: { back: true } });

  // Сменили вид приёмки — это другая работа, грузим заново.
  useEffect(() => {
    loaded.current = false;
  }, [kind]);

  useEffect(() => {
    if (!KIND_TITLES[kind]) {
      setError("Вид приёмки не указан");
      setStage("error");
      return;
    }
    // Адрес мы подменяем сами — перезагружать уже открытую приёмку незачем.
    if (loaded.current) return;
    let alive = true;
    findCurrent(kind)
      .then((d) => {
        if (!alive) return;
        loaded.current = true;
        if (d.found) {
          setReceiving(d.receiving);
          setCounters(d.counters);
          setItems(d.items);
          setStage("work");
          return;
        }
        // Открытой нет — сначала «НАЧАТЬ»: нажатие и есть начало рабочего времени.
        setStage("start");
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

  const receivingRef = useRef<Receiving | null>(null);
  receivingRef.current = receiving;
  const opening = useRef<Promise<Receiving> | null>(null);

  /** Приёмка заводится первой проверкой. Два быстрых пика не создадут две —
   *  ждут одно и то же открытие, а сервер и так отдаёт уже открытую. */
  const ensureReceiving = useCallback(async () => {
    if (receivingRef.current) return receivingRef.current.id;
    if (!opening.current) {
      opening.current = openReceiving(kind).finally(() => {
        opening.current = null;
      });
    }
    const r = await opening.current;
    receivingRef.current = r;
    setReceiving(r);
    return r.id;
  }, [kind]);

  const startNew = () => {
    setReceiving(null);
    receivingRef.current = null;
    setCounters(EMPTY);
    setItems([]);
    setLast(null);
    setNotFound("");
    setListOpen(false);
    setResult("");
    setClosing(false);
    setStage("start");
  };

  const begin = async () => {
    setStarting(true);
    try {
      const r = await openReceiving(kind);
      receivingRef.current = r;
      setReceiving(r);
      setStage("work");
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const toggleStopwatch = () => {
    const next = !swOn;
    localStorage.setItem(STOPWATCH_KEY, next ? "1" : "0");
    setSwOn(next);
  };

  const refresh = useCallback(async (id: number, r?: string) => {
    try {
      const d = await loadState(id, r ?? resultRef.current);
      setCounters(d.counters);
      setItems(d.items);
    } catch {
      /* молча: счётчики подтянутся при следующем действии */
    }
  }, []);

  const takeItem = useCallback((item: DailyItem, status: WipeStatus = "ready") => {
    setNotFound("");
    setResumeFactory(false);
    setWipeStatus(status);
    setCurrent(item);
    setTakenAt(Date.now());
    // Начало работы над единицей пишем по часам телефона; сбой сети работу не останавливает.
    // В протирке время идёт только по единице, которую можно протирать.
    const rid = receivingRef.current?.id;
    if (rid && (!isWipe || status === "ready" || status === "sale")) markTaken(rid, item.id).catch(() => {});
  }, [isWipe]);

  /** Выбор вручную в протирке — статус всё равно спрашиваем у сервера. */
  const pickItem = useCallback(
    async (item: DailyItem) => {
      if (!isWipe) return takeItem(item);
      try {
        const r = await wipeScan("", item.id);
        if (r.found && r.item) takeItem(r.item, r.status || "ready");
      } catch (e) {
        toast({ title: (e as Error).message, variant: "destructive" });
      }
    },
    [isWipe, takeItem]
  );

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const r = isWipe ? await wipeScan(code) : await scanCode(code);
        if (r.found && r.item) {
          takeItem(r.item, ("status" in r && r.status) || "ready");
        } else {
          setCurrent(null);
          setNotFound(code);
        }
      } catch (e) {
        toast({ title: (e as Error).message, variant: "destructive" });
      }
    },
    [takeItem, isWipe]
  );

  // Вернулись с камеры, которую открывали из шага заводского кода, —
  // открываем окно проверки заново на том же шаге.
  useEffect(() => {
    if (stage !== "work") return;
    const raw = sessionStorage.getItem(FACTORY_RESUME_KEY);
    if (!raw) return;
    sessionStorage.removeItem(FACTORY_RESUME_KEY);
    try {
      const saved = JSON.parse(raw) as { receivingId: number; item: DailyItem };
      if (saved.receivingId === (receiving?.id ?? 0)) {
        setResumeFactory(true);
        setCurrent(saved.item);
        return;
      }
    } catch {
      /* битая запись — просто не восстанавливаем */
    }
    // Окно не восстановили — код с камеры не должен всплыть у другой единицы.
    localStorage.removeItem("receiving_scan_daily_factory");
  }, [stage, receiving]);

  const rememberFactory = () => {
    if (!current) return;
    sessionStorage.setItem(
      FACTORY_RESUME_KEY,
      JSON.stringify({ receivingId: receiving?.id ?? 0, item: current })
    );
  };

  useBarcodeScanner({
    enabled: stage === "work" && !current && !askFinish,
    onScan: handleScan,
  });

  const afterCheck = (c: Counters, item: DailyItem) => {
    setCounters(c);
    setCurrent(null);
    setLast(item);
    if (receivingRef.current && listOpen) refresh(receivingRef.current.id);
  };

  const undoLast = async () => {
    if (!last || !receiving) return;
    setUndoing(true);
    try {
      const r = isWipe ? await wipeUndo(receiving.id, last.id) : await undoCheck(last.id, receiving.id);
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

  const removeFromReceiving = async (item: DailyItem) => {
    if (!receiving) return;
    setRemovingId(item.id);
    try {
      const r = isWipe ? await wipeUndo(receiving.id, item.id) : await removeItem(item.id, receiving.id);
      setCounters(r.counters);
      // Убрали ту, что висит в «последней проверке» — убираем и оттуда.
      setLast((p) => (p?.id === item.id ? null : p));
      refresh(receiving.id);
      toast({ title: "Товар вернулся в общий пул" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setRemovingId(0);
    }
  };

  const finish = async () => {
    if (!receiving) return;
    setClosing(true);
    try {
      const res = await closeReceiving(receiving.id);
      if (res.deleted) {
        setAskFinish(false);
        toast({ title: "Пустая приёмка не сохранена" });
        startNew();
        return;
      }
      // Остаёмся здесь: возврат на «Приёмки» у мастера с одним видом
      // сразу снова открывал экран приёмки.
      setFinished(counters);
      setAskFinish(false);
      setStage("done");
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setClosing(false);
      setAskFinish(false);
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

  if (stage === "start") {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-white/[0.08] bg-card">
          <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goBack}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-base font-semibold truncate">{title}</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto w-full px-4 py-6 flex-1 space-y-6">
          <button
            onClick={begin}
            disabled={starting}
            className="w-full aspect-[2/1] max-h-64 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 flex flex-col items-center justify-center gap-2 shadow-lg disabled:opacity-60 transition-colors"
          >
            <Icon name={starting ? "Loader2" : "Play"} size={44} className={starting ? "animate-spin" : ""} />
            <span className="text-3xl font-bold tracking-wide">НАЧАТЬ</span>
            <span className="text-sm opacity-80">время начала запишется с телефона</span>
          </button>
          <PastReceivings backTo={`/admin/receiving-daily?kind=${encodeURIComponent(kind)}`} />
        </main>
      </div>
    );
  }

  if (stage === "done") {
    const rows = isWipe
      ? [
          { label: "Готово", n: finished.sale, color: "text-emerald-400" },
          { label: "Утиль", n: finished.scrap, color: "text-rose-400" },
        ]
      : [
          { label: "На продажу", n: finished.sale, color: "text-emerald-400" },
          { label: "На протирку", n: finished.wipe, color: "text-sky-400" },
          { label: "Под ремонт", n: finished.repair, color: "text-amber-400" },
          { label: "В утиль", n: finished.scrap, color: "text-rose-400" },
        ];
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-card p-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
            <Icon name="CircleCheck" size={26} className="text-emerald-400" />
          </div>
          <p className="font-semibold text-center mb-1">Приёмка закрыта</p>
          <p className="text-sm text-muted-foreground text-center mb-4">
            {title} · {isWipe ? "обработано" : "проверено"} {finished.total} шт.
          </p>
          <div className="rounded-lg bg-white/[0.03] divide-y divide-white/[0.06] mb-5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center px-3 py-2 text-sm">
                <span className="flex-1">{r.label}</span>
                <span className={`font-medium ${r.color}`}>{r.n}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Button className="w-full h-11" onClick={startNew}>
              <Icon name="Plus" size={16} className="mr-1.5" />
              Начать новую
            </Button>
            <Button variant="ghost" className="w-full" onClick={goBack}>
              Назад
            </Button>
          </div>
        </div>
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
              {receiving
                ? `№${receiving.id} · ${receivingDate(receiving.work_date)}${receivingTimes(receiving).start ? ` · начало ${receivingTimes(receiving).start}` : ""}${receiving.employee_name ? ` · ${receiving.employee_name}` : ""} · `
                : ""}
              {isWipe ? "Обработано" : "Проверено"}: {counters.total}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            title="Склады и остатки"
            onClick={() => navigate(`/admin/receiving-stock?from=${encodeURIComponent(kind)}`)}
          >
            <Icon name="Warehouse" size={18} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={closing || !receiving}
            onClick={() => setAskFinish(true)}
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
          <div className="text-sm flex-1 min-w-0">
            <div className="font-medium">Сканер готов</div>
            <div className="text-xs text-muted-foreground">
              Пикайте товар — или найдите вручную ниже
            </div>
          </div>
          <button
            onClick={toggleStopwatch}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
              swOn
                ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-200"
                : "border-white/[0.1] text-muted-foreground"
            }`}
          >
            <Icon name="Timer" size={14} />
            Секундомер
          </button>
        </div>

        <SearchBox onPick={pickItem} onCameraCode={handleScan} />

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

        <DailyCounters
          wipe={isWipe}
          counters={counters}
          active={result}
          onPick={(k) => {
            setResult(k);
            setListOpen(true);
            if (receiving) refresh(receiving.id, k);
          }}
        />

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
            <span className="text-sm font-medium flex-1">
              {result
                ? `${counterTitle(result, isWipe)}: ${counters[result] ?? 0}`
                : isWipe
                  ? "Обработано в этой приёмке"
                  : "Проверено в этой приёмке"}
            </span>
            {result ? (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setResult("");
                  if (receiving) refresh(receiving.id, "");
                }}
                className="text-xs text-primary hover:underline"
              >
                показать все
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{counters.total}</span>
            )}
            <Icon
              name={listOpen ? "ChevronUp" : "ChevronDown"}
              size={16}
              className="text-muted-foreground"
            />
          </button>

          {listOpen && (
            <div className="border-t border-white/[0.06] max-h-80 overflow-y-auto p-2 space-y-2">
              {items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground text-center">
                  {isWipe ? "Пока ничего не обработано" : "Пока ничего не проверено"}
                </p>
              ) : (
                items.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    wipe={isWipe}
                    canRemove={isWipe || canRemove}
                    busy={removingId === it.id}
                    onRemove={removeFromReceiving}
                  />
                ))
              )}
            </div>
          )}
        </div>

        <PastReceivings
          excludeId={receiving?.id}
          backTo={`/admin/receiving-daily?kind=${encodeURIComponent(kind)}`}
        />
      </main>

      {askFinish && (
        <FinishDialog
          total={counters.total}
          busy={closing}
          onConfirm={finish}
          onCancel={() => setAskFinish(false)}
        />
      )}

      {current && swOn && takenAt > 0 && <Stopwatch since={takenAt} />}

      {current && isWipe && receiving && (
        <WipeDialog
          item={current}
          status={wipeStatus}
          receivingId={receiving.id}
          onDone={afterCheck}
          onClose={() => setCurrent(null)}
        />
      )}

      {current && !isWipe && (
        <CheckDialog
          item={current}
          getReceivingId={ensureReceiving}
          onDone={afterCheck}
          onClose={() => setCurrent(null)}
          resumeFactory={resumeFactory}
          onCameraOpen={rememberFactory}
        />
      )}
    </div>
  );
};

export default ReceivingDaily;