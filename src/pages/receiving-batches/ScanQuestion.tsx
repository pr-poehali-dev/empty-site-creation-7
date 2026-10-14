import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type { BatchItem, ScanOptions, ScanResult } from "@/lib/batches";

export interface Question {
  code: string;
  res: ScanResult;
  opts: ScanOptions;
}

interface Props {
  q: Question;
  busy: boolean;
  onAnswer: (opts: ScanOptions) => void;
  onRemove: (item: BatchItem) => void;
  onClose: () => void;
}

const Shell = ({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy: boolean;
}) => (
  <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
    <div className="w-full sm:max-w-md bg-card border-t sm:border border-white/[0.1] sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-white/[0.08] px-4 py-3 flex items-start gap-2">
        <p className="flex-1 font-semibold">{title}</p>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} disabled={busy}>
          <Icon name="X" size={18} />
        </Button>
      </div>
      <div className="px-4 py-3 space-y-3">{children}</div>
    </div>
  </div>
);

/** Вопросы при пике: с какого склада, какой товар, чужой склад, что убрать. */
const ScanQuestion = ({ q, busy, onAnswer, onRemove, onClose }: Props) => {
  const { res, opts } = q;
  const pos = res.position;
  const posLine = pos && <div className="text-sm break-words font-medium">{pos.name}</div>;
  const posRef = pos
    ? { product_group: pos.product_group, brand: pos.brand, model: pos.model }
    : opts.position;

  if (res.need === "pick_position") {
    return (
      <Shell title="Какой это товар?" onClose={onClose} busy={busy}>
        <p className="text-xs text-muted-foreground">
          Код {q.code} записан у нескольких товаров. Выберите тот, что у вас в руках.
        </p>
        {(res.positions || []).map((p, i) => (
          <Button
            key={i}
            variant="outline"
            className="w-full h-auto min-h-11 py-2 justify-between border-white/[0.1] text-left whitespace-normal"
            disabled={busy}
            onClick={() =>
              onAnswer({
                ...opts,
                position: { product_group: p.product_group, brand: p.brand, model: p.model },
              })
            }
          >
            <span className="break-words">{p.name}</span>
            <span className="text-xs text-muted-foreground shrink-0 ml-2">своб. {p.free}</span>
          </Button>
        ))}
      </Shell>
    );
  }

  if (res.need === "pick_warehouse") {
    return (
      <Shell title="Укажите, с какого склада товар" onClose={onClose} busy={busy}>
        {posLine}
        <div className="grid grid-cols-1 gap-2">
          {(res.stock || []).map((s) => (
            <Button
              key={s.name}
              className="h-12 justify-between"
              disabled={busy}
              onClick={() => onAnswer({ ...opts, position: posRef, warehouse: s.name })}
            >
              <span>{s.name}</span>
              <span className="text-xs opacity-80">свободно {s.free}</span>
            </Button>
          ))}
        </div>
      </Shell>
    );
  }

  if (res.need === "other_wh") {
    const fromList = res.from_wh
      ? [{ name: res.from_wh, free: 0 }]
      : (res.stock || []).filter((s) => s.name !== res.batch_wh);
    const allowed = res.allowed || [];
    return (
      <Shell title="Товар с другого склада" onClose={onClose} busy={busy}>
        {posLine}
        <p className="text-sm">
          Партия собирается со склада <b>«{res.batch_wh}»</b>, а этот товар лежит
          {res.from_wh ? (
            <>
              {" "}на <b>«{res.from_wh}»</b>.
            </>
          ) : (
            " на другом складе."
          )}
        </p>
        <div className="flex flex-col gap-2">
          {fromList.map((s) => (
            <div key={s.name} className="space-y-2">
              {!res.from_wh && (
                <div className="text-xs text-muted-foreground">
                  «{s.name}» — свободно {s.free}
                </div>
              )}
              {res.can_mix !== false && (
              <Button
                variant="outline"
                className="w-full h-11 border-amber-500/40 text-amber-200"
                disabled={busy}
                onClick={() =>
                  onAnswer({
                    ...opts,
                    position: posRef,
                    warehouse: res.from_wh ? opts.warehouse : s.name,
                    on_other: "mix",
                  })
                }
              >
                <Icon name="Shuffle" size={15} className="mr-1.5" />
                Сделать смешанной{res.from_wh ? "" : ` — взять с «${s.name}»`}
              </Button>
              )}
              {res.can_move && allowed.includes(s.name) && (
                <Button
                  variant="outline"
                  className="w-full h-11 border-white/[0.1]"
                  disabled={busy}
                  onClick={() =>
                    onAnswer({
                      ...opts,
                      position: posRef,
                      warehouse: res.from_wh ? opts.warehouse : s.name,
                      on_other: "move",
                    })
                  }
                >
                  <Icon name="ArrowRightLeft" size={15} className="mr-1.5" />
                  Переместить на «{res.batch_wh}»
                </Button>
              )}
            </div>
          ))}
          <Button variant="ghost" className="w-full h-10" disabled={busy} onClick={onClose}>
            Пропустить
          </Button>
        </div>
      </Shell>
    );
  }

  if (res.need === "pick_remove") {
    return (
      <Shell title="Какую единицу убрать?" onClose={onClose} busy={busy}>
        <p className="text-sm text-amber-200 flex items-start gap-1.5">
          <Icon name="Tag" size={16} className="shrink-0 mt-0.5" />
          Проверьте наклейку поставщика на товаре в руках
        </p>
        {(res.rows || []).map((it) => (
          <button
            key={it.id}
            disabled={busy}
            onClick={() => onRemove(it)}
            className={`w-full text-left rounded-xl border px-3 py-2.5 hover:bg-white/[0.05] ${
              it.kind === "auto"
                ? "border-amber-500/40 bg-amber-500/[0.06]"
                : "border-white/[0.08] bg-white/[0.02]"
            }`}
          >
            <div className={`font-mono break-all ${it.kind === "auto" ? "text-lg" : "text-sm"}`}>
              {it.supplier_barcode || "—"}
            </div>
            <div className="text-xs text-muted-foreground break-words">
              {it.order_number ? `з/н ${it.order_number} · ` : ""}
              {it.kind === "auto" ? "подставлена" : "подтверждена"}
            </div>
          </button>
        ))}
      </Shell>
    );
  }

  return null;
};

export default ScanQuestion;
