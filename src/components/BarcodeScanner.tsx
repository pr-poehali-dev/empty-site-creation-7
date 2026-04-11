import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const BarcodeScanner = ({ onClose }: BarcodeScannerProps) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center p-6">
      <Icon name="ScanLine" size={56} className="text-white/60 mb-4" />
      <p className="text-white text-sm text-center mb-5 max-w-sm">
        Сканер временно отключён. Используйте ручной ввод штрихкода.
      </p>
      <Button variant="outline" className="rounded-xl border-white/20 text-white" onClick={onClose}>
        Закрыть
      </Button>
    </div>
  );
};

export default BarcodeScanner;
