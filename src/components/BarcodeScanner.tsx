import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const SCAN_COOLDOWN = 1500;

const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  const applyAutoSettings = async (track: MediaStreamTrack) => {
    try {
      const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
      const advanced: MediaTrackConstraintSet[] = [];

      const focusModes = (caps.focusMode as string[] | undefined) || [];
      if (focusModes.includes("continuous")) {
        advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
      }

      const exposureModes = (caps.exposureMode as string[] | undefined) || [];
      if (exposureModes.includes("continuous")) {
        advanced.push({ exposureMode: "continuous" } as MediaTrackConstraintSet);
      }

      const wbModes = (caps.whiteBalanceMode as string[] | undefined) || [];
      if (wbModes.includes("continuous")) {
        advanced.push({ whiteBalanceMode: "continuous" } as MediaTrackConstraintSet);
      }

      if (advanced.length > 0) {
        await track.applyConstraints({ advanced });
      }
    } catch (e) {
      console.warn("applyAutoSettings failed:", e);
    }
  };

  useEffect(() => {
    const hints = new Map();
    const formats = [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
    ];
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 100,
      delayBetweenScanSuccess: 500,
    });
    readerRef.current = reader;

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track) {
          await applyAutoSettings(track);
          console.log("Camera capabilities:", track.getCapabilities?.());
        }

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        reader.decodeFromVideoElement(videoRef.current, (result) => {
          if (result) {
            const text = result.getText();
            const now = Date.now();
            if (now - lastScanRef.current < SCAN_COOLDOWN) return;
            lastScanRef.current = now;

            if (navigator.vibrate) navigator.vibrate(100);
            setLastScanned(text);
            onScan(text);

            setTimeout(() => setLastScanned(null), 1200);
          }
        });
      } catch (err) {
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
      }
    };

    startScanner();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
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

      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[85%] max-w-sm h-32 border-2 border-white/60 rounded-2xl relative">
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-orange-500 rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-orange-500 rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-orange-500 rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-orange-500 rounded-br-2xl" />
          </div>
        </div>

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

      <div className="px-4 py-3 bg-black/80 text-center">
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
