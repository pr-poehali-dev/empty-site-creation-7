import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import {
  CHECKSUM_BAD_TEXT,
  checksumState,
  findSimilar,
  loadCodeInfo,
  replaceCode,
  type CodeInfo,
  type CodeSummary,
  type SimilarResult,
} from "@/lib/barcodeFix";
import AssignCodePanel from "@/components/receiving/AssignCodePanel";

interface Props {
  /** Код, который отсканировали и не нашли. Он считается верным — с настоящей наклейки. */
  code: string;
  /** Место, откуда открыли окно: у каждого своя ячейка для камеры. */
  place: string;
  onClose: () => void;
  /** Замена прошла: старый ошибочный код стал отсканированным. */
  onReplaced: (newCode: string, updated: number) => void;
  /** Перед уходом на камеру — запомнить фильтры экрана. */
  onCameraOpen?: () => void;
  /** Ошибочный код, который исправляем заведомо (страница владельца) — показываем первым. */
  pinned?: CodeSummary | null;
}

interface Confirm {
  old: CodeSummary;
  source: "similar" | "supplier" | "owner";
}

/** Разметка цифр кандидата: какие совпадают с отсканированным кодом, а какие нет. */
const diffMarks = (target: string, cand: string): { ch: string; diff: boolean }[] => {
  const n = target.length;
  const m = cand.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (target[i - 1] === cand[j - 1] ? 0 : 1)
      );
    }
  }
  const marks: { ch: string; diff: boolean }[] = [];
  let i = n;
  let j = m;
  while (j > 0) {
    if (i > 0 && d[i][j] === d[i - 1][j - 1] + (target[i - 1] === cand[j - 1] ? 0 : 1)) {
      marks.unshift({ ch: cand[j - 1], diff: target[i - 1] !== cand[j - 1] });
      i--;
      j--;
    } else if (d[i][j] === d[i][j - 1] + 1) {
      marks.unshift({ ch: cand[j - 1], diff: true });
      j--;
    } else {
      i--;
    }
  }
  return marks;
};

const Digits = ({ target, code }: { target: string; code: string }) => (
  <span className="font-mono text-[15px] tracking-wide break-all">
    {diffMarks(target, code).map((m, k) => (
      <span
        key={k}
        className={m.diff ? "text-rose-300 bg-rose-500/25 rounded-[3px] px-[1px]" : ""}
      >
        {m.ch}
      </span>
    ))}
  </span>
);

const unitsText = (n: number) => `${n} шт.`;

/**
 * Окно «Похожие коды». Заводской код пикнули, а в базе его нет — значит, мастер
 * когда-то ошибся в цифрах при ручном вводе. Предлагаем близкие коды или
 * определяем товар точно — по этикетке поставщика. Заменяет человек, с подтверждением.
 */
const SimilarCodesDialog = ({
  code,
  place,
  onClose,
  onReplaced,
  onCameraOpen,
  pinned,
}: Props) => {
  const [data, setData] = useState<SimilarResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<CodeInfo | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const scannedBad = checksumState(code) === "bad";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError("");
    setInfo(null);
    setTransfer(false);
    findSimilar(code)
      .then((r) => {
        if (!alive) return;
        setData(r);
        if (r.exists) loadCodeInfo(code).then((i) => alive && setInfo(i)).catch(() => undefined);
      })
      .catch((e) => alive && setLoadError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code]);

  const doReplace = async () => {
    if (!confirm) return;
    setSaving(true);
    try {
      const r = await replaceCode(confirm.old.code, code, confirm.source);
      toast({ title: `Код исправлен: ${r.updated} шт.` });
      onReplaced(code, r.updated);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setSaving(false);
    }
  };

  const candidates: CodeSummary[] = data
    ? pinned && pinned.code !== code
      ? [pinned, ...data.candidates.filter((c) => c.code !== pinned.code)]
      : data.candidates
    : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-card border-t sm:border border-white/[0.1] sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-white/[0.08] px-4 py-3 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground">
              {data?.exists ? "Заводской код" : "Заводской код не найден"}
            </div>
            <div className="font-mono text-base font-semibold break-all">{code}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={onClose}
            disabled={saving}
          >
            <Icon name="X" size={18} />
          </Button>
        </div>

        {confirm ? (
          <div className="px-4 py-4 space-y-3">
            <p className="text-base font-semibold">Заменить код?</p>
            <div className="rounded-xl bg-white/[0.04] p-3 space-y-2 text-sm">
              <div className="break-words">{confirm.old.name || "без наименования"}</div>
              {confirm.old.orders.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Заказ-наряд: {confirm.old.orders.join(", ")}
                </div>
              )}
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-baseline pt-1">
                <span className="text-xs text-muted-foreground">Было</span>
                <Digits target={code} code={confirm.old.code} />
                <span className="text-xs text-muted-foreground">Станет</span>
                <span className="font-mono text-[15px] tracking-wide break-all text-emerald-300">
                  {code}
                </span>
              </div>
            </div>
            <p className="text-sm">
              Код поменяется у <b>{unitsText(confirm.old.units)}</b> этой модели.
            </p>
            {scannedBad && (
              <p className="text-xs text-rose-300 flex items-start gap-1.5">
                <Icon name="CircleAlert" size={14} className="shrink-0 mt-0.5" />
                У нового кода не сходится контрольное число — убедитесь, что его прочитали верно
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 h-11 border-white/[0.1]"
                disabled={saving}
                onClick={() => setConfirm(null)}
              >
                Назад
              </Button>
              <Button className="flex-1 h-11" disabled={saving} onClick={doReplace}>
                {saving ? (
                  <Icon name="Loader2" size={16} className="animate-spin" />
                ) : (
                  "Заменить"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 space-y-4">
            {scannedBad && !assigning && (
              <p className="text-xs text-rose-300 flex items-start gap-1.5">
                <Icon name="CircleAlert" size={14} className="shrink-0 mt-0.5" />
                {CHECKSUM_BAD_TEXT}
              </p>
            )}

            <div className={`space-y-2 ${assigning ? "hidden" : ""}`}>
              <p className="text-sm font-medium">Похожие коды в базе</p>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Icon name="Loader2" size={16} className="animate-spin" />
                  Ищу похожие...
                </div>
              )}
              {loadError && <p className="text-sm text-rose-300">{loadError}</p>}
              {data?.exists && (
                <p className="text-sm text-emerald-300 flex items-start gap-1.5">
                  <Icon name="CircleCheck" size={16} className="shrink-0 mt-0.5" />
                  Этот код в базе есть — ошибки в нём нет. Скорее всего, товар лежит на
                  другом складе или ещё не прошёл приёмку.
                </p>
              )}
              {data?.too_short && (
                <p className="text-sm text-muted-foreground">
                  Код слишком короткий — похожих будет слишком много. Укажите товар ниже.
                </p>
              )}
              {data && !data.too_short && candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Похожих кодов нет.
                </p>
              )}
              {candidates.map((c) => (
                <button
                  key={c.code}
                  onClick={() =>
                    setConfirm({ old: c, source: pinned?.code === c.code ? "owner" : "similar" })
                  }
                  className="w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] px-3 py-2 space-y-0.5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Digits target={code} code={c.code} />
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {pinned?.code === c.code
                        ? "исправляемый"
                        : c.distance === 1
                          ? "1 цифра"
                          : `${c.distance} цифры`}
                    </span>
                  </div>
                  <div className="text-sm break-words">{c.name || "без наименования"}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.orders.length > 0 ? `Заказ-наряд: ${c.orders.join(", ")} · ` : ""}
                    {unitsText(c.units)}
                    {c.checksum === "bad" ? " · контрольное число не сходится" : ""}
                  </div>
                </button>
              ))}
            </div>

            {data && !data.exists && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3 space-y-2">
                <p className="text-sm font-medium">Присвоить код товару</p>
                <p className={`text-xs text-muted-foreground ${assigning ? "hidden" : ""}`}>
                  Если это не опечатка, а новый код — укажите, чей он. Код добавится к товару,
                  даже если у него уже есть другие коды.
                </p>
                <AssignCodePanel
                  code={code}
                  place={place}
                  scannerEnabled={!saving}
                  onCameraOpen={onCameraOpen}
                  onConfirmChange={setAssigning}
                  onDone={(n) => onReplaced(code, n)}
                />
              </div>
            )}

            {data?.exists && info && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
                <p className="text-sm font-medium">Код сейчас записан у товара</p>
                {!assigning && info.positions.map((p, i) => (
                  <div key={i} className="rounded-lg bg-black/20 px-2.5 py-1.5">
                    <div className="text-sm break-words">{p.name || "без наименования"}</div>
                    <div className="text-xs text-muted-foreground">{unitsText(p.units)}</div>
                  </div>
                ))}
                <div
                  className={`rounded-xl border transition-colors ${
                    transfer
                      ? "border-amber-500/50 bg-amber-500/[0.06]"
                      : "border-white/[0.1] bg-white/[0.02]"
                  }`}
                >
                  {!assigning && (
                    <button
                      type="button"
                      onClick={() => setTransfer((v) => !v)}
                      aria-expanded={transfer}
                      className="w-full h-11 px-3 flex items-center gap-2 text-left"
                    >
                      <span
                        className={`flex-1 text-sm ${
                          transfer ? "text-amber-200" : "text-muted-foreground"
                        }`}
                      >
                        Код записан не на тот товар?
                      </span>
                      <Icon
                        name="ChevronDown"
                        size={18}
                        className={`shrink-0 transition-transform duration-200 ${
                          transfer ? "rotate-180 text-amber-200" : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  )}
                  {transfer && (
                    <div className={`px-3 pb-3 space-y-3 ${assigning ? "pt-3" : ""}`}>
                      {!assigning && (
                        <p className="text-xs text-amber-200 flex items-start gap-1.5">
                          <Icon name="TriangleAlert" size={14} className="shrink-0 mt-0.5" />
                          Переносите, только если проверили товар физически: код уберётся у
                          товара выше и перейдёт к выбранному.
                        </p>
                      )}
                      <AssignCodePanel
                        code={code}
                        place={`${place}_move`}
                        moveFrom={info.positions}
                        scannerEnabled={!saving}
                        onCameraOpen={onCameraOpen}
                        onConfirmChange={setAssigning}
                        onDone={(n) => onReplaced(code, n)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button variant="ghost" className="w-full h-10" onClick={onClose}>
              Закрыть — ничего не менять
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimilarCodesDialog;