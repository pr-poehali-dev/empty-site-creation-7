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
  const lastScanRef = useRef<number>(0);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [capsInfo, setCapsInfo] = useState<string>("");

  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoomStep, setZoomStep] = useState(0.1);
  const [zoom, setZoom] = useState(1);

  const getVideoTrack = (): MediaStreamTrack | null => {
    const videoElement = document.querySelector("#barcode-scanner-region video") as HTMLVideoElement | null;
    if (!videoElement?.srcObject) return null;
    return (videoElement.srcObject as MediaStream).getVideoTracks()[0] || null;
  };

  const applyAllConstraints = async (track: MediaStreamTrack) => {
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
      console.warn("applyAllConstraints failed:", e);
    }
  };

  const handleZoomChange = async (value: number) => {
    setZoom(value);
    const track = videoTrackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: value } as unknown as MediaTrackConstraintSet],
      });
    } catch (e) {
      console.warn("zoom failed:", e);
    }
  };

  useEffect(() => {
    const regionId = "barcode-scanner-region";
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
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
        setTimeout(async () => {
          const track = getVideoTrack();
          if (!track) return;
          videoTrackRef.current = track;

          const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
          console.log("Camera capabilities:", caps);

          const capKeys = Object.keys(caps).join(", ");
          setCapsInfo(capKeys || "нет данных");

          if (typeof caps.zoom === "object" && caps.zoom !== null) {
            const z = caps.zoom as { min?: number; max?: number; step?: number };
            if (z.min !== undefined && z.max !== undefined && z.max > z.min) {
              setZoomSupported(true);
              setZoomMin(z.min);
              setZoomMax(z.max);
              setZoomStep(z.step || 0.1);
              setZoom(z.min);
            }
          }

          await applyAllConstraints(track);
        }, 500);
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

      <div className="flex-1 flex items-center justify-center relative">
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

      {zoomSupported && (
        <div className="px-4 py-2 bg-black/80 flex items-center gap-3">
          <Icon name="ZoomOut" size={16} className="text-white/60" />
          <input
            type="range"
            min={zoomMin}
            max={zoomMax}
            step={zoomStep}
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="flex-1 accent-orange-500"
          />
          <Icon name="ZoomIn" size={16} className="text-white/60" />
          <span className="text-white/60 text-xs w-10 text-right">{zoom.toFixed(1)}×</span>
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
              {zoomSupported ? "Используйте зум для чёткости" : "Поднесите камеру ближе к штрихкоду"}
            </p>
            {capsInfo && (
              <p className="text-white/30 text-[10px] mt-0.5">Capabilities: {capsInfo}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BarcodeScanner;
