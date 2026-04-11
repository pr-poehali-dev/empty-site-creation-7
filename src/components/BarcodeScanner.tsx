import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const SCAN_COOLDOWN = 1500;

const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScanRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  useEffect(() => {
    const regionId = "barcode-scanner-region";
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;

    const tryApplyFocus = () => {
      try {
        const videoElement = document.querySelector("#barcode-scanner-region video") as HTMLVideoElement | null;
        if (!videoElement?.srcObject) return;
        const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
        if (!track) return;
        const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
        const advanced: MediaTrackConstraintSet[] = [];
        if (Array.isArray(caps.focusMode) && (caps.focusMode as string[]).includes("continuous")) {
          advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        }
        if (advanced.length > 0) {
          track.applyConstraints({ advanced }).catch((e) => {
            console.warn("applyConstraints focus failed:", e);
          });
        }
      } catch (e) {
        console.warn("focus setup error:", e);
      }
    };

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 280, height: 140 },
          aspectRatio: 1.333,
          disableFlip: false,
        },
        (decodedText) => {
          const now = Date.now();
          if (now - lastScanRef.current < SCAN_COOLDOWN) return;
          lastScanRef.current = now;

          if (navigator.vibrate) navigator.vibrate(100);
          setLastScanned(decodedText);
          onScan(decodedText);

          setTimeout(() => setLastScanned(null), 1200);
        },
        () => {}
      )
      .then(() => {
        setTimeout(tryApplyFocus, 300);
      })
      .catch((err) => {
        console.error("Scanner start error:", err);
        const errStr = String(err);
        if (errStr.includes("NotAllowedError") || errStr.includes("Permission")) {
          setError("Доступ к камере запрещён. Разрешите в настройках браузера.");
        } else if (errStr.includes("NotFoundError")) {
          setError("Камера не найдена на устройстве");
        } else if (errStr.includes("NotReadableError")) {
          setError("Камера занята другим приложением");
        } else {
          setError(`Не удалось запустить камеру: ${errStr.slice(0, 100)}`);
        }
      });

    return () => {
      scanner
        .stop()
        .catch(() => {})
        .finally(() => {
          scanner.clear();
        });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 z-10">
        <p className="text-white text-sm font-medium">Сканирование штрихкода</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-white hover:bg-white/20"
          onClick={onClose}
        >
          <Icon name="X" size={20} />
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center relative" ref={containerRef}>
        <div id="barcode-scanner-region" className="w-full h-full" />

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-6">
            <div className="text-center">
              <Icon name="CameraOff" size={48} className="text-red-400 mx-auto mb-3" />
              <p className="text-white text-sm">{error}</p>
              <Button
                variant="outline"
                className="mt-4 rounded-xl border-white/20 text-white"
                onClick={onClose}
              >
                Закрыть
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-4 bg-black/80 text-center">
        {lastScanned ? (
          <p className="text-green-400 text-sm font-medium flex items-center justify-center gap-2">
            <Icon name="Check" size={16} />
            {lastScanned}
          </p>
        ) : (
          <p className="text-white/60 text-sm">Наведите камеру на штрихкод</p>
        )}
      </div>
    </div>
  );
};

export default BarcodeScanner;