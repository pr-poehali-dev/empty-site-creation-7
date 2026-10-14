import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useSimilarCodes } from "@/hooks/useSimilarCodes";
import CameraScanButton from "@/components/receiving/CameraScanButton";
import SimilarCodesDialog from "@/components/receiving/SimilarCodesDialog";
import BatchGroups from "./receiving-batches/BatchGroups";
import ScanQuestion, { type Question } from "./receiving-batches/ScanQuestion";
import CounterpartyPicker from "./receiving-batches/CounterpartyPicker";
import { ConfirmDisband, FinishDialog, LogDialog } from "./receiving-batches/BatchDialogs";
import TakeDialog from "./receiving-batches/TakeDialog";
import BatchLabelDialog from "./receiving-batches/BatchLabelDialog";
import BatchShare from "./receiving-batches/BatchShare";
import { loadWarehouses } from "./receiving-stock/stockApi";
import {
  STATUS_TITLE,
  disbandBatch,
  finishBatch,
  parseBatchCode,
  publicLink,
  resolveBatchCode,
  takeFind,
  takeItems,
  deleteBatch,
  loadBatch,
  removeItem,
  removeScan,
  scanToBatch,
  setBatchMeta,
  type BatchItem,
  type BatchView,
  type ScanOptions,
  type ScanResult,
} from "@/lib/batches";

type Mode = "add" | "remove";

const dt = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/** Черновик и собранная партия: пикаем товар, он встаёт сверху и вспыхивает. */
const ReceivingBatch = () => {
  const navigate = useNavigate();
  const { id: idParam } = useParams();
  const id = Number(idParam) || 0;
  const modeKey = `batch_mode_${id}`;

  const [data, setData] = useState<BatchView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [mode, setModeState] = useState<Mode>(
    () => (sessionStorage.getItem(modeKey) as Mode) || "add"
  );
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [problem, setProblem] = useState<{ text: string; investigate?: boolean } | null>(null);
  const [flash, setFlash] = useState<{ id: number | null; key: number }>({ id: null, key: 0 });
  const [comment, setComment] = useState("");
  const [cpOpen, setCpOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [take, setTake] = useState<{ rows: BatchItem[]; exact: boolean } | null>(null);
  const [whs, setWhs] = useState<string[]>([]);
  const similar = useSimilarCodes(`batch_${id}`);
  const topRef = useRef<HTMLDivElement>(null);

  const setMode = (m: Mode) => {
    sessionStorage.setItem(modeKey, m);
    setModeState(m);
    setProblem(null);
  };

  const reload = useCallback(async () => {
    try {
      const d = await loadBatch(id);
      setData(d);
      setComment(d.batch.comment || "");
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    loadWarehouses()
      .then((r) => setWhs(r.warehouses.map((w) => w.name)))
      .catch(() => setWhs([]));
  }, []);

  const showFlash = (itemId: number) => {
    setFlash((f) => ({ id: itemId, key: f.key + 1 }));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handle = async (code: string, res: ScanResult, opts: ScanOptions) => {
    if (res.ok) {
      setQuestion(null);
      setProblem(null);
      if (res.message) toast({ title: res.message });
      if (res.removed) toast({ title: "Убрано из партии" });
      await reload();
      if (res.flash) showFlash(res.flash);
      return;
    }
    if (res.need === "unknown_code") {
      setQuestion(null);
      similar.open(code);
      return;
    }
    if (res.need) {
      setQuestion({ code, res, opts });
      return;
    }
    setQuestion(null);
    if (res.flash) showFlash(res.flash);
    setProblem({ text: res.error || "Не получилось", investigate: res.investigate });
  };

  const send = async (raw: string, opts: ScanOptions = {}) => {
    const code = raw.trim();
    if (!code || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (parseBatchCode(code)) {
        setValue("");
        const other = await resolveBatchCode(code);
        if (other && other !== id) navigate(`/admin/receiving-batches/${other}`);
        else if (other === id) toast({ title: "Это наклейка этой же партии" });
        else setProblem({ text: "Партия с такой наклейкой не найдена" });
        return;
      }
      if (mode === "remove" && !isDraftNow) {
        const f = await takeFind(id, code);
        setValue("");
        if (f.ok && f.rows) setTake({ rows: f.rows, exact: Boolean(f.exact) });
        else setProblem({ text: f.error || "Не нашли" });
        return;
      }
      const res =
        mode === "add" ? await scanToBatch(id, code, opts) : await removeScan(id, code);
      setValue("");
      await handle(code, res, opts);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (it: BatchItem) => {
    setBusy(true);
    try {
      const res = await removeItem(id, it.id);
      await handle("", res, {});
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const canEdit = Boolean(data?.can_edit);
  const isDraftNow = data?.batch.status === "draft";
  const dialogOpen =
    !!question || !!similar.code || cpOpen || confirmDelete || finishOpen || disbandOpen || logOpen || labelOpen || !!take;
  useBarcodeScanner({
    enabled: canEdit && !dialogOpen && !busy,
    onScan: (c) => send(c),
  });

  const saveComment = async () => {
    if (!data || comment === (data.batch.comment || "")) return;
    const r = await setBatchMeta(id, { comment });
    if (r.error) toast({ title: r.error, variant: "destructive" });
    else reload();
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      const r = await deleteBatch(id);
      if (r.error) throw new Error(r.error);
      toast({ title: `Черновик удалён, освобождено: ${r.freed || 0} шт.` });
      navigate("/admin/receiving-batches");
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setBusy(false);
    }
  };

  const back = () => navigate("/admin/receiving-batches");

  const run = async <T extends { ok?: boolean; error?: string }>(
    fn: () => Promise<T>,
    done: (r: T) => void | Promise<void>
  ) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.error) throw new Error(r.error);
      await done(r);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const doFinish = () =>
    run(
      () => finishBatch(id),
      async (r) => {
        setFinishOpen(false);
        sessionStorage.setItem(modeKey, "add");
        setModeState("add");
        toast({ title: `Партия ${r.number} собрана` });
        await reload();
      }
    );

  const doDisband = () =>
    run(
      () => disbandBatch(id),
      async (r) => {
        setDisbandOpen(false);
        toast({ title: `Партия разобрана, освобождено: ${r.freed || 0} шт.` });
        await reload();
      }
    );

  const doTake = (ids: number[], dest: "draft" | "move", to?: string) =>
    run(
      () => takeItems(id, ids, dest, to),
      async (r) => {
        setTake(null);
        if (dest === "move") toast({ title: `Забрано ${r.taken} шт. и перемещено на «${to}»` });
        else
          toast({
            title: `Забрано ${r.taken} шт. ${r.draft_created ? "в новый черновик" : "в ваш черновик"}`,
            description: r.draft_mixed ? "Черновик стал смешанным" : undefined,
          });
        await reload();
      }
    );

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        {loadError ? (
          <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
            <Icon name="TriangleAlert" size={32} className="mx-auto mb-3 text-amber-400" />
            <p className="font-medium mb-4">{loadError}</p>
            <Button onClick={back}>К партиям</Button>
          </div>
        ) : (
          <Icon name="Loader2" size={28} className="animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  const b = data.batch;
  const isDraft = b.status === "draft";
  const isDone = b.status === "done";
  const exact = data.items.filter((i) => i.kind === "exact").length;
  const labelData = b.public_key
    ? {
        number: b.number || "",
        code: b.code,
        link: publicLink(b.public_key),
        date: new Date(b.finished_at || b.created_at).toLocaleDateString("ru-RU"),
        warehouse: b.mixed ? "Смешанная" : b.warehouse || "",
        qty: data.items.length,
        counterparty: b.counterparty?.name || null,
      }
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={back}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">
              {isDraft ? `Черновик · ${b.created_by_name}` : `Партия ${b.number || b.id}`}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {!isDraft && `${STATUS_TITLE[b.status] || b.status} · `}
              {b.mixed ? "Смешанная" : b.warehouse || "склад задаст первый товар"} ·{" "}
              {data.items.length} шт.
              {data.items.length > 0 ? ` (подтв. ${exact})` : ""}
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="max-w-2xl mx-auto px-4 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1">
              {(["add", "remove"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`h-9 rounded-lg text-sm transition-colors ${
                    mode === m
                      ? m === "add"
                        ? "bg-violet-500/25 text-violet-100"
                        : "bg-rose-500/25 text-rose-100"
                      : "text-muted-foreground"
                  }`}
                >
                  {m === "add" ? "Добавить" : isDraft ? "Убирать" : "Забрать"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(value)}
                placeholder={
                  mode === "add"
                    ? "Наклейка, заказ-наряд или заводской код"
                    : isDraft
                      ? "Что убрать: наклейка или код"
                      : "Что забрать: наклейка или код"
                }
                className={`h-11 ${mode === "remove" ? "border-rose-500/50" : ""}`}
              />
              <CameraScanButton fieldKey={`batch_${id}_${mode}`} onCode={(c) => send(c)} />
              <Button
                className="h-11 px-4"
                disabled={!value.trim() || busy}
                onClick={() => send(value)}
              >
                <Icon
                  name={busy ? "Loader2" : mode === "add" ? "Plus" : "Minus"}
                  size={18}
                  className={busy ? "animate-spin" : ""}
                />
              </Button>
            </div>
            {problem && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.08] px-3 py-2 space-y-2">
                <p className="text-sm text-rose-200 flex items-start gap-1.5">
                  <Icon name="CircleAlert" size={16} className="shrink-0 mt-0.5" />
                  {problem.text}
                </p>
                {problem.investigate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-rose-500/40"
                    onClick={() => toast({ title: "Расследование пересорта — скоро" })}
                  >
                    <Icon name="SearchAlert" size={15} className="mr-1.5" fallback="Search" />
                    Расследовать
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-4 space-y-3 flex-1">
        <div ref={topRef} className="scroll-mt-48" />
        {!canEdit && isDraft && (
          <p className="text-xs text-muted-foreground">
            Чужой черновик — только просмотр
          </p>
        )}
        {!canEdit && isDone && (
          <p className="text-xs text-muted-foreground">Только просмотр</p>
        )}

        {canEdit && isDraft && data.can_finish && data.items.length > 0 && (
          <Button className="w-full h-12" disabled={busy} onClick={() => setFinishOpen(true)}>
            <Icon name="CircleCheckBig" size={18} className="mr-2" fallback="CircleCheck" />
            Завершить партию
          </Button>
        )}

        {!isDraft && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-3">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Номер</span>
              <span className="font-semibold break-all">{b.number}</span>
              <span className="text-muted-foreground">Склад</span>
              <span>{b.mixed ? "Смешанная" : b.warehouse}</span>
              <span className="text-muted-foreground">Собрал</span>
              <span>
                {b.created_by_name}
                {b.finished_at ? `, ${dt(b.finished_at)}` : ""}
              </span>
              {b.closed_at && (
                <>
                  <span className="text-muted-foreground">Разобрал</span>
                  <span>
                    {b.closed_by_name}, {dt(b.closed_at)}
                  </span>
                </>
              )}
            </div>
            {labelData && <BatchShare link={labelData.link} number={labelData.number} />}
            <div className="grid grid-cols-2 gap-2">
              {data.can_print && labelData && (
                <Button variant="outline" className="h-11 border-white/[0.1]" onClick={() => setLabelOpen(true)}>
                  <Icon name="Printer" size={16} className="mr-1.5" />
                  Наклейка
                </Button>
              )}
              <Button variant="outline" className="h-11 border-white/[0.1]" onClick={() => setLogOpen(true)}>
                <Icon name="History" size={16} className="mr-1.5" />
                Журнал
              </Button>
            </div>
          </div>
        )}

        <BatchGroups items={data.items} flashId={flash.id} flashKey={flash.key} />

        <div className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Контрагент</div>
            <button
              disabled={!canEdit}
              onClick={() => setCpOpen(true)}
              className="w-full text-left rounded-lg border border-white/[0.1] px-3 h-11 flex items-center gap-2 disabled:opacity-80"
            >
              <span className={`flex-1 truncate text-sm ${b.counterparty ? "" : "text-muted-foreground"}`}>
                {b.counterparty?.name || "Не выбран"}
              </span>
              {canEdit && <Icon name="ChevronDown" size={16} className="text-muted-foreground" />}
            </button>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Комментарий</div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onBlur={saveComment}
              disabled={!canEdit}
              rows={2}
              placeholder={canEdit ? "Например, куда и к какому сроку" : ""}
            />
          </div>
        </div>

        {isDraft && (
          <Button variant="ghost" className="w-full h-10" onClick={() => setLogOpen(true)}>
            <Icon name="History" size={15} className="mr-1.5" />
            Журнал
          </Button>
        )}

        {data.can_disband && (
          <Button
            variant="ghost"
            className="w-full h-10 text-rose-300"
            onClick={() => setDisbandOpen(true)}
          >
            <Icon name="PackageX" size={15} className="mr-1.5" fallback="Trash2" />
            Разобрать партию
          </Button>
        )}

        {canEdit && isDraft && (
          <Button
            variant="ghost"
            className="w-full h-10 text-rose-300"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="Trash2" size={15} className="mr-1.5" />
            Удалить черновик целиком
          </Button>
        )}
      </main>

      {question && (
        <ScanQuestion
          q={question}
          busy={busy}
          onAnswer={(opts) => send(question.code, opts)}
          onRemove={removeOne}
          onClose={() => setQuestion(null)}
        />
      )}

      {similar.code && (
        <SimilarCodesDialog
          code={similar.code}
          place={`batch_${id}`}
          onClose={similar.close}
          onReplaced={(c) => {
            similar.close();
            send(c);
          }}
        />
      )}

      {finishOpen && (
        <FinishDialog
          s={data.summary}
          counterparty={b.counterparty?.name || null}
          busy={busy}
          onConfirm={doFinish}
          onClose={() => setFinishOpen(false)}
        />
      )}

      {disbandOpen && (
        <ConfirmDisband
          number={b.number || ""}
          qty={data.items.length}
          busy={busy}
          onConfirm={doDisband}
          onClose={() => setDisbandOpen(false)}
        />
      )}

      {logOpen && <LogDialog batchId={id} onClose={() => setLogOpen(false)} />}

      {labelOpen && labelData && (
        <BatchLabelDialog data={labelData} onClose={() => setLabelOpen(false)} />
      )}

      {take && (
        <TakeDialog
          rows={take.rows}
          exact={take.exact}
          warehouses={whs}
          busy={busy}
          onTake={doTake}
          onClose={() => setTake(null)}
        />
      )}

      {cpOpen && (
        <CounterpartyPicker
          onClose={() => setCpOpen(false)}
          onPick={async (c) => {
            setCpOpen(false);
            const r = await setBatchMeta(id, { counterparty_id: c ? c.id : null });
            if (r.error) toast({ title: r.error, variant: "destructive" });
            else reload();
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75">
          <div className="w-full sm:max-w-sm bg-card border-t sm:border border-white/[0.1] rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
            <p className="font-semibold">Удалить черновик?</p>
            <p className="text-sm text-muted-foreground">
              Весь товар ({data.items.length} шт.) освободится и станет доступен для других
              партий. Сам товар со складов никуда не денется.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-11 border-white/[0.1]"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Отмена
              </Button>
              <Button
                className="flex-1 h-11 bg-rose-600 hover:bg-rose-500 text-white"
                disabled={busy}
                onClick={doDelete}
              >
                Удалить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceivingBatch;
