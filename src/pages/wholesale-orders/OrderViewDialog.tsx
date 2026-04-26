import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import DebugBadge from "@/components/DebugBadge";
import type { Order, OrderLine } from "./types";
import { statusLabels, paymentStatusLabels, NEXT_STATUS } from "./types";

interface Props {
  viewOrder: Order | null;
  viewLines: OrderLine[];
  viewLoading: boolean;
  viewTotal: number;
  statusUpdating: boolean;
  isOwner: boolean;
  setViewOrder: (order: Order | null) => void;
  updateOrderStatus: (status: string) => void;
  archiveOrder: () => void;
  formatDate: (dateStr: string) => string;
  onNavigatePayments: (orderId: number) => void;
  onEditOrder: (order: Order, lines: OrderLine[]) => void;
}

const OrderViewDialog = ({
  viewOrder,
  viewLines,
  viewLoading,
  viewTotal,
  statusUpdating,
  isOwner,
  setViewOrder,
  updateOrderStatus,
  archiveOrder,
  formatDate,
  onNavigatePayments,
  onEditOrder,
}: Props) => {
  return (
    <Dialog open={!!viewOrder} onOpenChange={(open) => { if (!open) setViewOrder(null); }}>
      <DialogContent className="rounded-2xl border-white/[0.08] bg-card sm:max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 flex-wrap">
            <span>{viewOrder?.customer_name}</span>
            {viewOrder && viewOrder.status === "completed" ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Завершена</Badge>
            ) : viewOrder && (
              <>
                <Badge className={`${(statusLabels[viewOrder.status] || statusLabels.new).className} text-xs`}>
                  {(statusLabels[viewOrder.status] || statusLabels.new).label}
                </Badge>
                <Badge className={`${(paymentStatusLabels[viewOrder.payment_status] || paymentStatusLabels.not_paid).className} text-xs`}>
                  {(paymentStatusLabels[viewOrder.payment_status] || paymentStatusLabels.not_paid).label}
                </Badge>
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        {viewOrder && (
          <div className="space-y-4 py-2">
            {viewOrder.comment && (
              <p className="text-sm text-muted-foreground">{viewOrder.comment}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {formatDate(viewOrder.created_at)} · {viewOrder.created_by}
            </p>

            {viewLoading ? (
              <div className="flex justify-center py-6">
                <Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : viewLines.length > 0 ? (
              <DebugBadge id="OrderView:linesList">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Позиции</label>
                <div className="space-y-1.5">
                  {viewLines.map((line) => {
                    const zeroPrice = !line.price || line.price === 0;
                    return (
                    <div
                      key={line.product_id}
                      className={`rounded-lg p-2.5 bg-white/[0.02] ${
                        zeroPrice
                          ? "border-2 border-red-500"
                          : "border border-white/[0.08]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{line.name}</p>
                          {line.article && <p className="text-xs text-muted-foreground">{line.article}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                        <span>{line.quantity} шт</span>
                        <span>×</span>
                        <span>{line.price.toLocaleString()} Br</span>
                        <span className="ml-auto font-medium text-foreground">
                          {(line.price * line.quantity).toLocaleString()} Br
                        </span>
                      </div>
                    </div>
                    );
                  })}
                </div>
                <div className="flex justify-end pt-2 border-t border-white/[0.08]">
                  <p className="text-base font-semibold">Итого: {viewTotal.toLocaleString()} Br</p>
                </div>
              </div>
              </DebugBadge>
            ) : null}
          </div>
        )}
        {viewOrder && (
          <div className="space-y-3 pt-2 border-t border-white/[0.08]">
            {viewOrder.status !== "archived" && viewOrder.status !== "completed" && (
              <div className="flex items-center gap-2 flex-wrap">
                {NEXT_STATUS[viewOrder.status] && (
                  <DebugBadge id="OrderView:nextStatusBtn" className="flex-1">
                    <Button
                      className="rounded-xl w-full"
                      disabled={statusUpdating}
                      onClick={() => updateOrderStatus(NEXT_STATUS[viewOrder.status].status)}
                    >
                      {statusUpdating ? (
                        <Icon name="Loader2" size={16} className="animate-spin" />
                      ) : (
                        <Icon name={NEXT_STATUS[viewOrder.status].icon} size={16} />
                      )}
                      <span className="ml-2">{NEXT_STATUS[viewOrder.status].label}</span>
                    </Button>
                  </DebugBadge>
                )}
                <DebugBadge id="OrderView:paymentBtn" className="flex-1">
                  <Button
                    variant="outline"
                    className="rounded-xl border-white/[0.08] w-full"
                    onClick={() => {
                      setViewOrder(null);
                      onNavigatePayments(viewOrder.id);
                    }}
                  >
                    <Icon name="Banknote" size={16} />
                    <span className="ml-2">Оплата</span>
                    {viewOrder.payment_status === "partially_paid" && (
                      <Badge className="ml-1 bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Частично</Badge>
                    )}
                    {viewOrder.payment_status === "paid" && (
                      <Badge className="ml-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Оплачена</Badge>
                    )}
                  </Button>
                </DebugBadge>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {viewOrder.status === "new" && (
                <DebugBadge id="OrderView:editBtn">
                  <Button
                    variant="outline"
                    className="rounded-xl border-white/[0.08]"
                    onClick={() => onEditOrder(viewOrder, viewLines)}
                  >
                    <Icon name="Pencil" size={16} />
                    <span className="ml-1">Редактировать</span>
                  </Button>
                </DebugBadge>
              )}
              {viewOrder.status === "archived" && isOwner && (
                <Button
                  className="rounded-xl"
                  disabled={statusUpdating}
                  onClick={() => updateOrderStatus("restore")}
                >
                  {statusUpdating ? (
                    <Icon name="Loader2" size={16} className="animate-spin" />
                  ) : (
                    <Icon name="ArchiveRestore" size={16} />
                  )}
                  <span className="ml-2">Вернуть в работу</span>
                </Button>
              )}
              {viewOrder.status === "confirmed" && (
                <Button
                  variant="outline"
                  className="rounded-xl border-white/[0.08]"
                  disabled={statusUpdating}
                  onClick={() => updateOrderStatus("new")}
                >
                  <Icon name="Undo2" size={16} />
                  <span className="ml-1">Отменить подтверждение</span>
                </Button>
              )}
              {viewOrder.status === "shipped" && (
                <Button
                  variant="outline"
                  className="rounded-xl border-white/[0.08]"
                  disabled={statusUpdating}
                  onClick={() => updateOrderStatus("confirmed")}
                >
                  <Icon name="Undo2" size={16} />
                  <span className="ml-1">Отменить отгрузку</span>
                </Button>
              )}
              {viewOrder.status !== "archived" && (
                <DebugBadge id="OrderView:archiveBtn">
                  <Button
                    variant="outline"
                    onClick={archiveOrder}
                    className="rounded-xl border-white/[0.08] text-destructive hover:text-destructive"
                  >
                    <Icon name="Trash2" size={16} />
                    <span className="ml-1">Удалить</span>
                  </Button>
                </DebugBadge>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OrderViewDialog;