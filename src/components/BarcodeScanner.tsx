import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectorRef = useRef<BarcodeDetectorType | null>(null);
  const lastScanRef = useRef<number>(0);
  const scanningRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [status, setStatus] = useState<"initializing" | "scanning" | "photoOnly">("initializing");
  const [flashCapture, setFlashCapture] = useState(false);

  const processScan = (code: string) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN) return;
    lastScanRef.current = now;

    if (navigator.vibrate) navigator.vibrate(100);
    setLastScanned(code);
    onScan(code);
    setTimeout(() => setLastScanned(null), 1200);
  };

  const applyAutoSettings = async (track: MediaStreamTrack) => {
    try {
      const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
      console.log("Camera capabilities:", caps);
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

  const pickBackCamera = async (): Promise<string | undefined> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      const back = videoDevices.find((d) =>
        /back|rear|environment/i.test(d.label)
      );
      return back?.deviceId;
    } catch {
      return undefined;
    }
  };

  const scanLoop = async () => {
    if (!scanningRef.current || !videoRef.current || !detectorRef.current) return;
    try {
      if (videoRef.current.readyState >= 2) {
        const results = await detectorRef.current.detect(videoRef.current);
        if (results && results.length > 0) {
          processScan(results[0].rawValue);
        }
      }
    } catch (e) {
      console.warn("scan error:", e);
    }
    if (scanningRef.current) {
      timerRef.current = setTimeout(scanLoop, 120);
    }
  };

  const takePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;
    setFlashCapture(true);
    setTimeout(() => setFlashCapture(false), 200);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const results = await detectorRef.current.detect(canvas);
      if (results && results.length > 0) {
        processScan(results[0].rawValue);
      } else {
        setLastScanned(null);
      }
    } catch (e) {
      console.warn("photo scan error:", e);
    }
  };

  const handleFileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      if (window.BarcodeDetector) {
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"],
        });
        const results = await detector.detect(img);
        if (results && results.length > 0) {
          processScan(results[0].rawValue);
          URL.revokeObjectURL(img.src);
          return;
        }
      }
      setError("Не удалось распознать штрихкод на фото. Попробуйте ещё раз.");
      setTimeout(() => setError(null), 2500);
    } catch (err) {
      console.warn("file scan error:", err);
    }
    if (e.target) e.target.value = "";
  };

  useEffect(() => {
    const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

    if (!hasDetector) {
      setStatus("photoOnly");
      return;
    }

    const start = async () => {
      try {
        const backDeviceId = await pickBackCamera();

        const videoConstraints: MediaTrackConstraints = backDeviceId
          ? {
              deviceId: { exact: backDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track) {
          await applyAutoSettings(track);
        }

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("video.play error:", playErr);
        }

        const DetectorCtor = window.BarcodeDetector!;
        let supportedFormats: string[] = [];
        try {
          supportedFormats = (await DetectorCtor.getSupportedFormats?.()) || [];
        } catch {
          /* ignore */
        }

        const desired = [
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

        detectorRef.current = new DetectorCtor({ formats: desired });
        scanningRef.current = true;
        setStatus("scanning");
        scanLoop();
      } catch (err) {
        console.error("Scanner start error:", err);
        const errStr = String(err);
        if (errStr.includes("NotAllowedError") || errStr.includes("Permission")) {
          setError("Доступ к камере запрещён. Разрешите в настройках браузера.");
        } else if (errStr.includes("NotFoundError")) {
          setStatus("photoOnly");
        } else if (errStr.includes("NotReadableError")) {
          setError("Камера занята другим приложением");
        } else {
          setStatus("photoOnly");
        }
      }
    };

    start();

    return () => {
      scanningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
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
        <p className="text-white text-sm font-medium">
          {status === "photoOnly" ? "Сфотографируйте штрихкод" : "Сканирование"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-white hover:bg-white/20"
          onClick={onClose}
        >
          <Icon name="X" size={20} />
        </Button>
      </div>

      {status === "photoOnly" ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <Icon name="Camera" size={56} className="text-white/60 mx-auto mb-4" />
            <p className="text-white text-sm mb-5">
              Непрерывное сканирование недоступно на этом устройстве. Сфотографируйте штрихкод — система распознает его.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileCapture}
            />
            <Button
              className="rounded-xl h-12 px-6"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="Camera" size={18} />
              <span className="ml-2">Сфотографировать</span>
            </Button>
            {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
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
          <canvas ref={canvasRef} className="hidden" />

          {flashCapture && <div className="absolute inset-0 bg-white/60 pointer-events-none" />}

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

          {status === "scanning" && !error && (
            <button
              className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              onClick={takePhoto}
              aria-label="Сделать фото"
            >
              <div className="w-14 h-14 rounded-full border-4 border-black" />
            </button>
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
          <>
            <p className="text-white/60 text-xs">
              {status === "photoOnly"
                ? "Используется родная камера устройства"
                : "Наведите на штрихкод или нажмите кнопку-затвор"}
            </p>
            <p className="text-white/30 text-[10px] mt-1">
              Поддерживается: Chrome, Edge, Samsung Internet
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default BarcodeScanner;