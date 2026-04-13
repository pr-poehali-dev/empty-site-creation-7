import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import type { OrderLine } from "./types";

interface Props {
  createOpen: boolean;
  editOrderId: number | null;
  customerName: string;
  comment: string;
  lines: OrderLine[];
  totalAmount: number;
  saving: boolean;
  setCreateOpen: (open: boolean) => void;
  setEditOrderId: (id: number | null) => void;
  setCustomerName: (v: string) => void;
  setComment: (v: string) => void;
  updateLineQty: (index: number, qty: number) => void;
  updateLinePrice: (index: number, price: number) => void;
  removeLine: (index: number) => void;
  goToList: () => void;
  handleCreate: () => void;
}

const OrderCreateDialog = ({
  createOpen,
  editOrderId,
  customerName,
  comment,
  lines,
  totalAmount,
  saving,
  setCreateOpen,
  setEditOrderId,
  setCustomerName,
  setComment,
  updateLineQty,
  updateLinePrice,
  removeLine,
  goToList,
  handleCreate,
}: Props) => {
  return (
    <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditOrderId(null); } }}>
      <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{editOrderId ? "Редактировать заявку" : "Создать заявку"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Оптовик *</label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Имя или название компании"
              className="h-10 rounded-xl bg-secondary border-white/[0.08]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Комментарий</label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Примечание к заявке"
              className="h-10 rounded-xl bg-secondary border-white/[0.08]"
            />
          </div>

          <Button
            variant="outline"
            className="w-full h-11 rounded-xl border-white/[0.08] justify-center gap-2"
            onClick={goToList}
          >
            <Icon name="List" size={18} />
            {lines.length > 0 ? `Список (${lines.length})` : "Создать список"}
          </Button>

          {lines.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Позиции</label>
              <div className="space-y-1.5">
                {lines.map((line, i) => (
                  <div
                    key={line.product_id}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{line.name}</p>
                        {line.article && <p className="text-xs text-muted-foreground">{line.article}</p>}
                      </div>
                      <button
                        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors flex-shrink-0"
                        onClick={() => removeLine(i)}
                      >
                        <Icon name="X" size={14} className="text-destructive" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateLineQty(i, parseInt(e.target.value) || 1)}
                        className="w-16 h-8 text-center text-sm rounded-lg bg-secondary border-white/[0.08] px-1"
                        min={1}
                      />
                      <Input
                        type="number"
                        value={line.price}
                        onChange={(e) => updateLinePrice(i, parseFloat(e.target.value) || 0)}
                        className="w-24 h-8 text-sm rounded-lg bg-secondary border-white/[0.08] px-2"
                      />
                      <span className="text-sm font-medium ml-auto flex-shrink-0">
                        {(line.price * line.quantity).toLocaleString()} ₽
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2 border-t border-white/[0.08]">
                <p className="text-base font-semibold">Итого: {totalAmount.toLocaleString()} ₽</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setCreateOpen(false)}
            className="rounded-xl border-white/[0.08]"
          >
            Отмена
          </Button>
          <Button onClick={handleCreate} disabled={saving} className="rounded-xl">
            {saving ? (
              <Icon name="Loader2" size={18} className="animate-spin" />
            ) : (
              <Icon name="Check" size={18} />
            )}
            <span className="ml-2">{saving ? "Сохранение..." : "Сохранить"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderCreateDialog;