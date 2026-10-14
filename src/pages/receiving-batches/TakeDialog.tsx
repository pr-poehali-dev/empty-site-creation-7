import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type { BatchItem } from "@/lib/batches";
import { Sheet } from "./BatchDialogs";

interface Props {
  /** Найденные по пику единицы; exact — пикнули наклейку, выбор не нужен. */
  rows: BatchItem[];
  exact: boolean;
  warehouses: string[];
  busy: boolean;
  onTake: (ids: number[], dest: "draft" | "move", warehouseTo?: string) => void;
  onClose: () => void;
}

const STUBS = ["В другое место", "Продать", "Списать"];

/** «Забрать» из собранной партии: что именно, потом — куда. */
const TakeDialog = ({ rows, exact, warehouses, busy, onTake, onClose }: Props) => {
  const [picked, setPicked] = useState<number[]>(exact ? rows.map((r) => r.id) : []);
  const [moveOpen, setMoveOpen] = useState(false);
  const [stub, setStub] = useState("");

  if (picked.length === 0) {
    return (
      <Sheet title="Какую единицу забрать?" onClose={onClose} busy={busy}>
        <p className="text-sm text-amber-200 flex items-start gap-1.5">
          <Icon name="Tag" size={16} className="shrink-0 mt-0.5" />
          Проверьте наклейку поставщика на товаре в руках
        </p>
        {rows.map((it) => (
          <button
            key={it.id}
            onClick={() => setPicked([it.id])}
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
              {[it.order_number && `з/н ${it.order_number}`, it.warehouse, it.kind === "auto" ? "подставлена" : "подтверждена"]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </button>
        ))}
      </Sheet>
    );
  }

  const chosen = rows.filter((r) => picked.includes(r.id));

  return (
    <Sheet title="Куда забрать?" onClose={onClose} busy={busy}>
      <div className="rounded-xl bg-white/[0.04] px-3 py-2">
        {chosen.map((it) => (
          <div key={it.id} className="text-sm break-words">
            {it.tech_name}
            <div className="text-[11px] text-muted-foreground">
              {[it.supplier_barcode, it.warehouse].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
      </div>

      {!moveOpen ? (
        <div className="space-y-2">
          <Button className="w-full h-12 justify-start" disabled={busy} onClick={() => onTake(picked, "draft")}>
            <Icon name="FilePlus2" size={17} className="mr-2" />
            Создать новую партию
          </Button>
          <p className="text-[11px] text-muted-foreground -mt-1 px-1">
            Уйдёт в ваш черновик; если черновик уже есть — в него
          </p>
          <Button
            variant="outline"
            className="w-full h-12 justify-start border-white/[0.1]"
            disabled={busy}
            onClick={() => setMoveOpen(true)}
          >
            <Icon name="ArrowRightLeft" size={17} className="mr-2" />
            Переместить товар → Со склада на склад
          </Button>
          {STUBS.map((s) => (
            <Button
              key={s}
              variant="outline"
              className="w-full h-11 justify-start border-white/[0.06] text-muted-foreground"
              onClick={() => setStub(s)}
            >
              {s}
              <span className="ml-auto text-[11px]">скоро</span>
            </Button>
          ))}
          {stub && <p className="text-xs text-muted-foreground">«{stub}» появится в следующих этапах</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">На какой склад переместить?</p>
          {warehouses.length === 0 && (
            <p className="text-sm text-muted-foreground">Склады вам не открыты</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {warehouses.map((w) => (
              <Button key={w} className="h-11" disabled={busy} onClick={() => onTake(picked, "move", w)}>
                {w}
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="w-full h-10" disabled={busy} onClick={() => setMoveOpen(false)}>
            Назад
          </Button>
        </div>
      )}
    </Sheet>
  );
};

export default TakeDialog;
