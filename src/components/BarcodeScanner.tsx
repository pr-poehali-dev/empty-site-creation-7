import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const SCAN_COOLDOWN = 1500;

type DetectedBarcode = {
  rawValue: string;
  format: string;
};

type BarcodeDetectorType = {
  detect: (source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) => Promise<DetectedBarcode[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorType;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorType | null>(null);
  const lastScanRef = useRef<number>(0);
  const scanningRef = useRef<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [nativeSupported, setNativeSupported] = useState<boolean | null>(null);
  const [manualCode, setManualCode] = useState("");

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

  const processScan = (code: string) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN) return;
    lastScanRef.current = now;

    if (navigator.vibrate) navigator.vibrate(100);
    setLastScanned(code);
    onScan(code);
    setTimeout(() => setLastScanned(null), 1200);
  };

  const scanLoop = async () => {
    if (!scanningRef.current || !videoRef.current || !detectorRef.current) return;
    try {
      const results = await detectorRef.current.detect(videoRef.current);
      if (results && results.length > 0) {
        processScan(results[0].rawValue);
      }
    } catch (e) {
      console.warn("scan error:", e);
    }
    if (scanningRef.current) {
      rafRef.current = window.setTimeout(scanLoop, 150) as unknown as number;
    }
  };

  useEffect(() => {
    const isSupported = typeof window !== "undefined" && "BarcodeDetector" in window;
    setNativeSupported(isSupported);

    if (!isSupported) return;

    const start = async () => {
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
          console.log("Camera capabilities:", track.getCapabilities?.());
          await applyAutoSettings(track);
        }

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const DetectorCtor = window.BarcodeDetector;
        if (!DetectorCtor) return;

        let supportedFormats: string[] = [];
        try {
          supportedFormats = (await DetectorCtor.getSupportedFormats?.()) || [];
        } catch {
          /* ignore */
        }
        console.log("Supported barcode formats:", supportedFormats);

        const desiredFormats = [
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "code_128",
          "code_39",
          "code_93",
          "itf",
          "qr_code",
          "data_matrix",
        ].filter((f) => supportedFormats.length === 0 || supportedFormats.includes(f));

        detectorRef.current = new DetectorCtor({ formats: desiredFormats });
        scanningRef.current = true;
        scanLoop();
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

    start();

    return () => {
      scanningRef.current = false;
      if (rafRef.current) {
        clearTimeout(rafRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  const submitManual = () => {
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setManualCode("");
    }
  };

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

      {nativeSupported === false ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <Icon name="ScanLine" size={48} className="text-white/60 mx-auto mb-3" />
            <p className="text-white text-sm mb-4">
              Этот браузер не поддерживает сканирование камерой. Введите штрихкод вручную.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Введите штрихкод"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitManual()}
                className="h-10 rounded-xl bg-white/10 border-white/20 text-white"
              />
              <Button onClick={submitManual} className="rounded-xl">
                <Icon name="Check" size={16} />
              </Button>
            </div>
            <p className="text-white/40 text-xs mt-3">Сканирование работает в Chrome на Android</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[85%] max-w-sm h-32 relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-orange-500 rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-orange-500 rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-orange-500 rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-orange-500 rounded-br-2xl" />
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
      )}

      <div className="px-4 py-3 bg-black/80 text-center">
        {lastScanned ? (
          <p className="text-green-400 text-sm font-medium flex items-center justify-center gap-2">
            <Icon name="Check" size={16} />
            {lastScanned}
          </p>
        ) : (
          <p className="text-white/60 text-sm">
            {nativeSupported === false ? "Ручной ввод" : "Наведите камеру на штрихкод"}
          </p>
        )}
      </div>
    </div>
  );
};

export default BarcodeScanner;
