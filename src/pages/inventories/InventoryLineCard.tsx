import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { InventoryItem } from "./types";
import { priceBorder, priceNote } from "./priceStyles";

interface Props {
  line: InventoryItem;
  index: number;
  total: number;
  isOwner: boolean;
  canEditPrices: boolean;
  onQty: (id: number, qty: number) => void;
  onPrice: (id: number, price: number) => void;
  onRemove: (id: number) => void;
}

const InventoryLineCard = ({
  line,
  index,
  total,
  isOwner,
  canEditPrices,
  onQty,
  onPrice,
  onRemove,
}: Props) => {
  const zeroPrice = !line.price || line.price === 0;
  const srcBorder = priceBorder(line);
  const note = priceNote(line, isOwner);
  const isTemp = line.is_temp === true || line.temp_product_id != null;

  return (
    <div
      className={`rounded-lg p-2.5 ${isTemp ? "bg-red-950/20" : "bg-white/[0.02]"} ${
        zeroPrice
          ? "border-2 border-red-500"
          : srcBorder || (isTemp ? "border border-red-500/30" : "border border-white/[0.08]")
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm break-words min-w-0">
            <span className="text-muted-foreground">{total - index}.</span> {line.name}
          </p>
          {line.article && <p className="text-xs text-muted-foreground">{line.article}</p>}
          {isTemp && (
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <Icon name="AlertTriangle" size={10} /> временный товар
            </p>
          )}
        </div>
        <div className="flex flex-col items-center flex-shrink-0">
          {isOwner && line.created_by && (
            <span className="text-[9px] text-blue-400 leading-none mb-0.5">id={line.created_by}</span>
          )}
          <button
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors"
            onClick={() => onRemove(line.id)}
          >
            <Icon name="X" size={14} className="text-destructive" />
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 mt-1.5">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1">
            <button
              className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08]"
              onClick={() => onQty(line.id, Math.max(0, line.quantity - 1))}
            >
              <Icon name="Minus" size={10} />
            </button>
            <Input
              type="number"
              value={line.quantity}
              onChange={(e) => onQty(line.id, parseInt(e.target.value) || 0)}
              onFocus={(e) => e.currentTarget.select()}
              className="w-12 h-6 text-center text-xs p-0 bg-white/[0.04] border-white/[0.08] rounded"
            />
            <button
              className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08]"
              onClick={() => onQty(line.id, line.quantity + 1)}
            >
              <Icon name="Plus" size={10} />
            </button>
          </div>
          {isOwner && line.qty_changed_by && (
            <span className="text-[9px] text-blue-400 leading-none mt-0.5">id={line.qty_changed_by}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground mt-1">шт</span>

        <div className="flex flex-col items-end ml-auto">
          <div className="flex items-center gap-1">
            {canEditPrices ? (
              <Input
                type="number"
                value={line.price}
                onChange={(e) => onPrice(line.id, parseFloat(e.target.value) || 0)}
                onFocus={(e) => e.currentTarget.select()}
                className="w-20 h-6 text-right text-xs p-1 bg-white/[0.04] border-white/[0.08] rounded"
              />
            ) : (
              <span className="w-20 h-6 flex items-center justify-end text-xs px-1">
                {line.price.toLocaleString()}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Br</span>
          </div>
          {note ? (
            <span className="text-[9px] text-blue-400 leading-none mt-0.5 whitespace-nowrap">{note}</span>
          ) : null}
        </div>

        <span className="text-xs font-medium flex-shrink-0 mt-1">
          = {(line.price * line.quantity).toLocaleString()} Br
        </span>
      </div>
    </div>
  );
};

export default InventoryLineCard;