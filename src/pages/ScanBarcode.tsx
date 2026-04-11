import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const MAX_VISIBLE = 5;
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) => Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
}

interface ScannedItem {
  id: number;
  barcode: string;
  name: string | null;
  found: boolean;
}

const getDetectorCtor = (): BarcodeDetectorConstructor | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
};

const ScanBarcode = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/admin/catalog";
  const storageKey = searchParams.get("key") || "scanned_barcodes";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const idCounterRef = useRef<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"initializing" | "scanning" | "unsupported">("initializing");
  const [flashCapture, setFlashCapture] = useState(false);
  const [flashError, setFlashError] = useState(false);
  const [collected, setCollected] = useState<string[]>([]);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [lastFlash, setLastFlash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const token = localStorage.getItem("auth_token") || "";
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const saveCollected = (next: string[]) => {
    setCollected(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const resolveBarcode = async (id: number, code: string): Promise<ScannedItem> => {
    try {
      const resp = await fetch(`${PRODUCTS_URL}?barcode=${encodeURIComponent(code)}`, {
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok && data.items && data.items.length > 0) {
        return { id, barcode: code, name: data.items[0].name, found: true };
      }
      if (resp.ok && data.item) {
        return { id, barcode: code, name: data.item.name, found: true };
      }
    } catch { /* ignore */ }
    return { id, barcode: code, name: null, found: false };
  };

  const processScan = async (code: string) => {
    if (navigator.vibrate) navigator.vibrate(100);
    setLastFlash(code);
    setTimeout(() => setLastFlash(null), 1200);

    const id = ++idCounterRef.current;

    setCollected((prev) => {
      const next = [...prev, code];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });

    const item = await resolveBarcode(id, code);
    setScannedItems((prev) => {
      const next = [item, ...prev].slice(0, MAX_VISIBLE);
      return next;
    });
  };

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

  const pickBackCamera = async (): Promise<string | undefined> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      const back = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
      return back?.deviceId;
    } catch {
      return undefined;
    }
  };

  const showError = (msg: string) => {
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    setErrorMsg(msg);
    setFlashError(true);
    setTimeout(() => setFlashError(false), 300);
    setTimeout(() => setErrorMsg(null), 1500);
  };

  const takePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;
    setFlashCapture(true);
    setTimeout(() => setFlashCapture(false), 150);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        showError("Ошибка камеры");
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const results = await detectorRef.current.detect(canvas);
      if (results && results.length > 0) {
        processScan(results[0].rawValue);
      } else {
        showError("Штрихкод не распознан");
      }
    } catch (e) {
      console.warn("photo scan error:", e);
      showError("Ошибка распознавания");
    }
  };

  const goBack = () => {
    navigate(returnTo);
  };

  const removeItem = (id: number, barcode: string) => {
    setScannedItems((prev) => prev.filter((s) => s.id !== id));
    setCollected((prev) => {
      const idx = prev.indexOf(barcode);
      if (idx === -1) return prev;
      const next = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    const DetectorCtor = getDetectorCtor();

    if (!DetectorCtor) {
      setStatus("unsupported");
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

        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track) await applyAutoSettings(track);

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("video.play error:", playErr);
        }

        let supportedFormats: string[] = [];
        try {
          supportedFormats = (await DetectorCtor.getSupportedFormats?.()) || [];
        } catch { /* ignore */ }

        const desired = [
          "ean_13", "ean_8", "upc_a", "upc_e",
          "code_128", "code_39", "code_93", "itf",
          "qr_code", "data_matrix",
        ].filter((f) => supportedFormats.length === 0 || supportedFormats.includes(f));

        detectorRef.current = new DetectorCtor({ formats: desired });
        setStatus("scanning");
      } catch (err) {
        console.error("Scanner start error:", err);
        const errStr = String(err);
        if (errStr.includes("NotAllowedError") || errStr.includes("Permission")) {
          setError("Доступ к камере запрещён. Разрешите в настройках браузера.");
        } else if (errStr.includes("NotReadableError")) {
          setError("Камера занята другим приложением");
        } else {
          setError(`Ошибка камеры: ${errStr.slice(0, 100)}`);
        }
      }
    };

    start();

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
    <div className="fixed inset-0 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-white hover:bg-white/20"
          onClick={goBack}
        >
          <Icon name="ArrowLeft" size={18} />
          <span className="ml-1">Назад</span>
        </Button>
        <p className="text-white text-sm font-medium">Сканирование</p>
        <Button
          size="sm"
          className="h-9"
          onClick={goBack}
        >
          <Icon name="Check" size={16} />
          <span className="ml-1">Готово{collected.length > 0 ? ` (${collected.length})` : ""}</span>
        </Button>
      </div>

      {status === "unsupported" ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <Icon name="AlertTriangle" size={48} className="text-yellow-400 mx-auto mb-3" />
            <p className="text-white text-sm mb-2">
              Сканирование не поддерживается в этом браузере.
            </p>
            <p className="text-white/60 text-xs mb-5">
              Используйте Chrome, Edge или Samsung Internet на Android.
            </p>
            <Button variant="outline" className="rounded-xl border-white/20 text-white" onClick={goBack}>
              Вернуться
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden" style={{ height: "40%" }}>
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
              <div className="w-[80%] max-w-xs h-20 relative">
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
                    onClick={goBack}
                  >
                    Вернуться
                  </Button>
                </div>
              </div>
            )}

            {lastFlash && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-green-500/90 text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 z-10">
                <Icon name="Check" size={14} />
                {lastFlash}
              </div>
            )}

            {errorMsg && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 z-10">
                <Icon name="AlertCircle" size={14} />
                {errorMsg}
              </div>
            )}

            {flashError && <div className="absolute inset-0 bg-red-500/40 pointer-events-none" />}
          </div>

          <div className="flex-1 bg-black/95 flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-white/10 flex-shrink-0">
              <p className="text-white/50 text-xs font-medium">
                {collected.length > 0
                  ? `Распознано: ${collected.length}`
                  : "Наведите на штрихкод и нажмите «Сканировать»"}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {scannedItems.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Icon name="ScanBarcode" size={32} className="text-white/20 mx-auto mb-2" />
                    <p className="text-white/30 text-xs">Поддерживается: Chrome, Edge, Samsung Internet</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {scannedItems.map((item, i) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                        i === 0 ? "bg-green-500/15" : "bg-white/[0.04]"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        item.found ? "bg-green-500/20" : "bg-yellow-500/20"
                      }`}>
                        <Icon
                          name={item.found ? "Package" : "HelpCircle"}
                          size={14}
                          className={item.found ? "text-green-400" : "text-yellow-400"}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${item.found ? "text-white" : "text-white/60"}`}>
                          {item.found ? item.name : "Товар не найден"}
                        </p>
                        <p className="text-[10px] text-white/30">{item.barcode}</p>
                      </div>
                      <button
                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 flex-shrink-0"
                        onClick={() => removeItem(item.id, item.barcode)}
                      >
                        <Icon name="X" size={12} className="text-white/40" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {status === "scanning" && !error && (
              <button
                className="w-full h-12 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold flex items-center justify-center gap-2 transition-colors flex-shrink-0"
                onClick={takePhoto}
              >
                <Icon name="ScanBarcode" size={20} />
                Сканировать
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ScanBarcode;