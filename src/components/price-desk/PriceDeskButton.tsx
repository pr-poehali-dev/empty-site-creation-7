import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { deskFromOrder } from "@/lib/priceDesk";

interface Props {
  orderId: number;
  beforeOpen?: () => void;
}

const PriceDeskButton = ({ orderId, beforeOpen }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const { id } = await deskFromOrder(orderId);
      beforeOpen?.();
      navigate(`/admin/price-desk/${id}`);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Ошибка", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 w-9 p-0 rounded-lg flex-shrink-0 text-violet-300"
      onClick={open}
      disabled={busy}
      title="Ценовой стол: цены маркетплейсов по сохранённым товарам заявки"
    >
      <Icon name={busy ? "Loader2" : "BadgeDollarSign"} size={18} className={busy ? "animate-spin" : ""} />
    </Button>
  );
};

export default PriceDeskButton;
