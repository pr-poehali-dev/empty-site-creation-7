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
  const reapplyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [focusHint, setFocusHint] = useState<{ x: number; y: number } | null>(null);
  const [capabilities, setCapabilities] = useState<string>("");

  const getVideoTrack = (): MediaStreamTrack | null => {
    const videoElement = document.querySelector("#barcode-scanner-region video") as HTMLVideoElement | null;
    if (!videoElement?.srcObject) return null;
    return (videoElement.srcObject as MediaStream).getVideoTracks()[0] || null;
  };

  const applyContinuousFocus = () => {
    const track = videoTrackRef.current || getVideoTrack();
    if (!track) return;
    videoTrackRef.current = track;
    try {
      const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
      const advanced: MediaTrackConstraintSet[] = [];
      const focusModes = (caps.focusMode as string[] | undefined) || [];

      if (focusModes.includes("continuous")) {
        advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
      } else if (focusModes.includes("single-shot")) {
        advanced.push({ focusMode: "single-shot" } as MediaTrackConstraintSet);
      }

      if (advanced.length > 0) {
        track.applyConstraints({ advanced }).catch((e) => {
          console.warn("applyContinuousFocus failed:", e);
        });
      }
    } catch (e) {
      console.warn("applyContinuousFocus error:", e);
    }
  };

  const handleTapFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    const track = videoTrackRef.current || getVideoTrack();
    if (!track) return;
    videoTrackRef.current = track;

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setFocusHint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setFocusHint(null), 800);

    try {
      const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
      const focusModes = (caps.focusMode as string[] | undefined) || [];
      const advanced: MediaTrackConstraintSet[] = [];

      if (focusModes.includes("manual")) {
        advanced.push({
          focusMode: "manual",
          pointsOfInterest: [{ x: relX, y: relY }],
        } as unknown as MediaTrackConstraintSet);
      } else if (focusModes.includes("single-shot")) {
        advanced.push({ focusMode: "single-shot" } as MediaTrackConstraintSet);
      } else if (focusModes.includes("continuous")) {
        advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
      }

      if (advanced.length > 0) {
        await track.applyConstraints({ advanced });
      }
    } catch (err) {
      console.warn("tap-to-focus failed:", err);
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
        setTimeout(() => {
          const track = getVideoTrack();
          if (track) {
            videoTrackRef.current = track;
            const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
            const modes = (caps.focusMode as string[] | undefined)?.join(",") || "нет";
            setCapabilities(modes);
            console.log("Camera capabilities:", caps);
          }
          applyContinuousFocus();
          reapplyIntervalRef.current = setInterval(applyContinuousFocus, 2000);
        }, 300);
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
      if (reapplyIntervalRef.current) {
        clearInterval(reapplyIntervalRef.current);
      }
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

      <div
        className="flex-1 flex items-center justify-center relative cursor-pointer"
        onClick={handleTapFocus}
      >
        <div id="barcode-scanner-region" className="w-full h-full" />

        {focusHint && (
          <div
            className="absolute w-16 h-16 border-2 border-yellow-400 rounded-full pointer-events-none animate-ping"
            style={{ left: focusHint.x - 32, top: focusHint.y - 32 }}
          />
        )}

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
          <>
            <p className="text-white/60 text-xs">Коснитесь экрана для фокусировки</p>
            {capabilities && (
              <p className="text-white/30 text-[10px] mt-0.5">Режимы фокуса: {capabilities}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BarcodeScanner;
