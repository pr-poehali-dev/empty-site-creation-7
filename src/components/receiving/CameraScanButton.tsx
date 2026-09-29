import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useCameraScan } from "@/hooks/useCameraScan";

interface Props {
  fieldKey: string;
  onCode: (code: string) => void;
  onOpen?: () => void;
  className?: string;
}

/**
 * Кнопка «Сканировать камерой» рядом с полем штрихкода в приёмке.
 * onCode получает код после возврата со сканера (когда кнопка снова на экране).
 * onOpen — чтобы запомнить открытое окно перед уходом на камеру.
 */
const CameraScanButton = ({ fieldKey, onCode, onOpen, className }: Props) => {
  const open = useCameraScan(fieldKey, onCode);

  return (
    <Button
      type="button"
      variant="outline"
      className={`h-11 w-11 p-0 shrink-0 border-white/[0.1] ${className || ""}`}
      onClick={() => {
        onOpen?.();
        open();
      }}
      aria-label="Сканировать камерой"
      title="Сканировать камерой"
    >
      <Icon name="Camera" size={18} />
    </Button>
  );
};

export default CameraScanButton;
