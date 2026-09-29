import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import SimilarCodesDialog from "@/components/receiving/SimilarCodesDialog";
import { useSimilarCodes } from "@/hooks/useSimilarCodes";
import {
  loadFixLog,
  loadSuspicious,
  revertFix,
  type CodeSummary,
  type FixRow,
} from "@/lib/barcodeFix";

type Tab = "bad" | "odd" | "log";

const FIXING_KEY = "barcode_control_fixing";

const when = (v: string) =>
  new Date(v).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const CodeCard = ({ c, onFix }: { c: CodeSummary; onFix: () => void }) => (
  <div className="rounded-xl border border-white/[0.08] bg-card px-3 py-2.5 space-y-1">
    <div className="font-mono text-[15px] break-all">{c.code}</div>
    <div className="text-sm break-words">{c.name || "без наименования"}</div>
    <div className="text-xs text-muted-foreground">
      {c.orders.length > 0 ? `Заказ-наряд: ${c.orders.join(", ")} · ` : ""}
      {c.units} шт.
    </div>
    <Button className="w-full h-10 mt-1" onClick={onFix}>
      <Icon name="Wrench" size={15} className="mr-1.5" />
      Исправить
    </Button>
  </div>
);

/**
 * Контроль заводских штрихкодов — только владелец.
 * Коды с неверным контрольным числом точно ошибочные; коды нестандартной
 * длины проверить нельзя — они подозрительные. Исправление — через то же окно,
 * что у мастеров: мастер отсканировал бы верный код, здесь его вводит владелец.
 */
const BarcodeControl = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";

  const [tab, setTab] = useState<Tab>("bad");
  const [bad, setBad] = useState<CodeSummary[]>([]);
  const [odd, setOdd] = useState<CodeSummary[]>([]);
  const [log, setLog] = useState<FixRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [who, setWho] = useState("");
  const [fixing, setFixingState] = useState<CodeSummary | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(FIXING_KEY) || "null");
    } catch {
      return null;
    }
  });
  const setFixing = (c: CodeSummary | null) => {
    if (c) sessionStorage.setItem(FIXING_KEY, JSON.stringify(c));
    else sessionStorage.removeItem(FIXING_KEY);
    setFixingState(c);
  };
  const [rightCode, setRightCode] = useState("");
  const [reverting, setReverting] = useState(0);
  const similar = useSimilarCodes("control");

  const loadCodes = useCallback(async () => {
    setBusy(true);
    try {
      const d = await loadSuspicious();
      setBad(d.bad);
      setOdd(d.unchecked);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      const d = await loadFixLog({ from, to, who });
      setLog(d.rows);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  }, [from, to, who]);

  useEffect(() => {
    if (isOwner) loadCodes();
  }, [isOwner, loadCodes]);

  useEffect(() => {
    if (!isOwner || tab !== "log") return;
    const t = setTimeout(loadLog, 300);
    return () => clearTimeout(t);
  }, [isOwner, tab, loadLog]);

  const revert = async (row: FixRow) => {
    setReverting(row.id);
    try {
      const r = await revertFix(row.id);
      toast({ title: `Откатили: ${r.restored} шт.` });
      loadLog();
      loadCodes();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setReverting(0);
    }
  };

  if (!isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="Lock" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium mb-4">Страница только для владельца</p>
          <Button onClick={() => navigate("/admin/receipts")}>К приёмкам</Button>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "bad", label: "Неверные", n: bad.length },
    { key: "odd", label: "Подозрительные", n: odd.length },
    { key: "log", label: "Журнал" },
  ];

  const list = tab === "bad" ? bad : odd;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => navigate("/admin/receipts")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="flex-1 min-w-0 text-base font-semibold truncate">
            Контроль штрихкодов
          </h1>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg border px-2 py-2 text-sm transition-colors ${
                tab === t.key
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                  : "border-white/[0.1] bg-white/[0.03]"
              }`}
            >
              {t.label}
              {t.n !== undefined && (
                <span className="ml-1 text-xs text-muted-foreground">{t.n}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-4 flex-1 space-y-3">
        {tab !== "log" && (
          <>
            <p className="text-xs text-muted-foreground">
              {tab === "bad"
                ? "У этих кодов не сходится контрольное число — в цифрах точно ошибка."
                : "Коды нестандартной длины: контрольное число у них проверить нельзя. Сверьте с товаром."}
            </p>
            {busy && (
              <div className="flex justify-center py-8">
                <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {!busy && list.length === 0 && (
              <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center">
                <Icon name="CircleCheck" size={30} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-sm text-muted-foreground">Таких кодов нет</p>
              </div>
            )}
            {!busy &&
              list.map((c) => (
                <CodeCard
                  key={c.code}
                  c={c}
                  onFix={() => {
                    setFixing(c);
                    setRightCode("");
                  }}
                />
              ))}
          </>
        )}

        {tab === "log" && (
          <>
            <div className="rounded-xl border border-white/[0.08] bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 text-xs"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <Input
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="Сотрудник"
                className="h-9 text-xs"
              />
            </div>
            {log.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Замен пока нет</p>
            )}
            {log.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl border border-white/[0.08] bg-card px-3 py-2.5 space-y-1 ${
                  r.reverted_at ? "opacity-60" : ""
                }`}
              >
                <div className="text-xs text-muted-foreground">
                  {when(r.fixed_at)} · {r.fixed_by_name || "—"} ·{" "}
                  {r.source === "supplier"
                    ? "по этикетке"
                    : r.source === "owner"
                      ? "вручную"
                      : "по похожему"}
                </div>
                <div className="font-mono text-sm break-all">
                  <span className="text-rose-300 line-through">{r.old_code}</span>
                  {" → "}
                  <span className="text-emerald-300">{r.new_code}</span>
                </div>
                <div className="text-xs text-muted-foreground">{r.units} шт.</div>
                {r.reverted_at ? (
                  <div className="text-xs text-amber-200">
                    Откачено {when(r.reverted_at)}
                    {r.reverted_by_name ? ` · ${r.reverted_by_name}` : ""}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-white/[0.1]"
                    disabled={reverting === r.id}
                    onClick={() => revert(r)}
                  >
                    <Icon name="Undo2" size={14} className="mr-1" />
                    Откатить
                  </Button>
                )}
              </div>
            ))}
          </>
        )}
      </main>

      {fixing && !similar.code && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75">
          <div className="w-full sm:max-w-md bg-card border-t sm:border border-white/[0.1] rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-muted-foreground">Ошибочный код</div>
                <div className="font-mono text-base break-all">{fixing.code}</div>
                <div className="text-sm break-words mt-1">{fixing.name}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setFixing(null)}
              >
                <Icon name="X" size={18} />
              </Button>
            </div>
            <p className="text-sm">
              Введите или отсканируйте верный код с товара — откроется сверка с похожими
              и подтверждение замены.
            </p>
            <Input
              value={rightCode}
              onChange={(e) => setRightCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && rightCode.trim() && similar.open(rightCode.trim())}
              placeholder="Верный заводской код"
              inputMode="numeric"
              className="h-11"
              autoFocus
            />
            <Button
              className="w-full h-11"
              disabled={!rightCode.trim()}
              onClick={() => similar.open(rightCode.trim())}
            >
              Дальше
            </Button>
          </div>
        </div>
      )}

      {similar.code && (
        <SimilarCodesDialog
          code={similar.code}
          place="control"
          pinned={fixing}
          onClose={() => {
            similar.close();
            setFixing(null);
          }}
          onReplaced={() => {
            similar.close();
            setFixing(null);
            loadCodes();
          }}
        />
      )}
    </div>
  );
};

export default BarcodeControl;
