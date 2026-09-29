import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useTorch } from "@/hooks/useTorch";
import {
  SavedCamera,
  Detector,
  applyAutoFocus,
  createDetector,
  listBackCameras,
  openCamera,
  saveCamera,
} from "./cameraStore";

const TEST_MS = 3000;
const FRAME_GAP_MS = 150;

type Result = { ok: true; code: string } | { ok: false };

interface Props {
  onDone: (cam: SavedCamera) => void;
  onCancel: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Мастер: перебираем задние камеры, каждую проверяем на реальном штрихкоде. */
const CameraSetupWizard = ({ onDone, onCancel }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [phase, setPhase] = useState<"loading" | "testing" | "summary">("loading");
  const [checking, setChecking] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const torch = useTorch();

  const stopStream = () => {
    torch.detach();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    const init = async () => {
      try {
        detectorRef.current = await createDetector();
        const probe = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        probe.getTracks().forEach((t) => t.stop());
        const list = await listBackCameras();
        if (list.length === 0) {
          setError("Не нашли ни одной камеры");
          return;
        }
        setCameras(list);
        setPhase("testing");
      } catch (e) {
        const name = (e as { name?: string })?.name || "";
        setError(
          name === "NotAllowedError"
            ? "Доступ к камере запрещён. Разрешите в настройках браузера."
            : "Не удалось включить камеру",
        );
      }
    };
    init();
    return stopStream;
  }, []);

  useEffect(() => {
    if (phase !== "testing" || !cameras[index]) return;
    let cancelled = false;
    const start = async () => {
      stopStream();
      try {
        const stream = await openCamera(cameras[index].deviceId);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track) await applyAutoFocus(track);
        if (!cancelled) await torch.attach(track);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setResults((prev) => ({ ...prev, [cameras[index].deviceId]: { ok: false } }));
        }
      }
    };
    start();
    return () => {
      cancelled = true;
    };
  }, [phase, index, cameras]);

  const check = async () => {
    const cam = cameras[index];
    const video = videoRef.current;
    if (!cam || !video || !detectorRef.current) return;
    setChecking(true);
    let found: string | null = null;
    const until = Date.now() + TEST_MS;
    while (Date.now() < until && !found) {
      try {
        const res = await detectorRef.current.detect(video);
        if (res?.length) found = res[0].rawValue;
      } catch { /* кадр ещё не готов */ }
      if (!found) await sleep(FRAME_GAP_MS);
    }
    if (found && navigator.vibrate) navigator.vibrate(100);
    setResults((prev) => ({
      ...prev,
      [cam.deviceId]: found ? { ok: true, code: found } : { ok: false },
    }));
    setChecking(false);
  };

  const goSummary = () => {
    stopStream();
    const firstOk = cameras.find((c) => results[c.deviceId]?.ok);
    setChosen(firstOk?.deviceId || null);
    setPhase("summary");
  };

  const next = () => {
    if (index + 1 < cameras.length) {
      setIndex(index + 1);
      return;
    }
    const only = cameras.length === 1 ? cameras[0] : null;
    if (only && results[only.deviceId]?.ok) {
      stopStream();
      const saved = { deviceId: only.deviceId, label: only.label };
      saveCamera(saved);
      onDone(saved);
      return;
    }
    goSummary();
  };

  const restart = () => {
    setResults({});
    setChosen(null);
    setIndex(0);
    setPhase("testing");
  };

  const confirm = () => {
    const cam = cameras.find((c) => c.deviceId === chosen);
    if (!cam) return;
    const saved = { deviceId: cam.deviceId, label: cam.label };
    saveCamera(saved);
    onDone(saved);
  };

  const camName = (i: number) => `Камера ${i + 1}`;
  const current = cameras[index];
  const currentResult = current ? results[current.deviceId] : undefined;
  const anyOk = cameras.some((c) => results[c.deviceId]?.ok);
  const isLast = index + 1 >= cameras.length;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col text-white">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-white hover:bg-white/20"
          onClick={() => {
            stopStream();
            onCancel();
          }}
        >
          <Icon name="ArrowLeft" size={18} />
          <span className="ml-1">Назад</span>
        </Button>
        <p className="text-sm font-medium">Настройка камеры</p>
        <div className="w-[76px]" />
      </div>

      {error ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <Icon name="CameraOff" size={48} className="text-red-400 mx-auto mb-3" />
            <p className="text-sm">{error}</p>
          </div>
        </div>
      ) : phase === "loading" ? (
        <div className="flex-1 flex items-center justify-center">
          <Icon name="Loader2" size={28} className="animate-spin text-white/50" />
        </div>
      ) : phase === "testing" && current ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pb-3 flex-shrink-0">
            <p className="text-sm">Возьмите любой товар со штрихкодом.</p>
            <p className="text-xs text-white/50">
              Наведите камеру с расстояния 10–15 см и нажмите «Проверить».
            </p>
          </div>

          <div className="relative overflow-hidden flex-shrink-0" style={{ height: "40%" }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover bg-white/[0.04]"
              playsInline
              muted
              autoPlay
            />
            {torch.available && (
              <button
                onClick={torch.toggle}
                aria-label={torch.on ? "Выключить фонарик" : "Включить фонарик"}
                className={`absolute top-3 right-3 z-20 w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${
                  torch.on
                    ? "bg-yellow-400 border-yellow-300 text-black"
                    : "bg-black/60 border-white/20 text-white"
                }`}
              >
                <Icon name={torch.on ? "Flashlight" : "FlashlightOff"} size={22} />
              </button>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[80%] max-w-xs h-20 border-2 border-orange-500/80 rounded-2xl" />
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3 px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {camName(index)} из {cameras.length}
              </p>
              {current.label && (
                <p className="text-[11px] text-white/40 truncate max-w-[55%]">{current.label}</p>
              )}
            </div>

            {currentResult &&
              (currentResult.ok ? (
                <div className="rounded-xl bg-green-500/15 border border-green-500/40 px-3 py-2.5 flex items-center gap-2">
                  <Icon name="CircleCheck" size={18} className="text-green-400 shrink-0" />
                  <p className="text-sm break-all">Прочитала: {currentResult.code}</p>
                </div>
              ) : (
                <div className="rounded-xl bg-red-500/15 border border-red-500/40 px-3 py-2.5 flex items-center gap-2">
                  <Icon name="CircleX" size={18} className="text-red-400 shrink-0" />
                  <p className="text-sm">Не прочитала</p>
                </div>
              ))}

            <div className="mt-auto space-y-2">
              <Button
                className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
                disabled={checking}
                onClick={check}
              >
                {checking ? (
                  <>
                    <Icon name="Loader2" size={18} className="animate-spin mr-2" />
                    Проверяю…
                  </>
                ) : (
                  <>
                    <Icon name="ScanBarcode" size={18} className="mr-2" />
                    {currentResult ? "Проверить ещё раз" : "Проверить"}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10"
                disabled={checking}
                onClick={next}
              >
                {!isLast
                  ? "Следующая камера"
                  : cameras.length === 1 && currentResult?.ok
                    ? "Сохранить"
                    : "Показать итог"}
                <Icon name="ArrowRight" size={16} className="ml-2" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col px-4 py-4 gap-3 overflow-y-auto">
          <p className="text-sm font-medium">Итог проверки</p>
          <div className="space-y-2">
            {cameras.map((c, i) => {
              const r = results[c.deviceId];
              const ok = r?.ok;
              const selected = chosen === c.deviceId;
              return (
                <button
                  key={c.deviceId}
                  disabled={!ok}
                  onClick={() => setChosen(c.deviceId)}
                  className={`w-full rounded-xl px-3 py-2.5 flex items-center gap-3 text-left border transition-colors ${
                    selected
                      ? "border-orange-500 bg-orange-500/15"
                      : "border-white/10 bg-white/[0.03]"
                  } ${ok ? "" : "opacity-60"}`}
                >
                  <Icon
                    name={ok ? "CircleCheck" : "CircleX"}
                    size={18}
                    className={`shrink-0 ${ok ? "text-green-400" : "text-red-400"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{camName(i)}</p>
                    <p className="text-[11px] text-white/40 truncate">
                      {r?.ok ? `Прочитала: ${r.code}` : r ? "Не прочитала" : "Не проверяли"}
                    </p>
                  </div>
                  {selected && <Icon name="Check" size={18} className="text-orange-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          {!anyOk && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
              <p className="text-sm text-amber-200">Ни одна камера не прочитала штрихкод.</p>
              <p className="text-xs text-white/50 mt-1">
                Держите телефон в 10–15 см от кода, при хорошем свете, и пройдите проверку ещё раз.
              </p>
            </div>
          )}

          <div className="mt-auto space-y-2 pt-2">
            <Button
              className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
              disabled={!chosen}
              onClick={confirm}
            >
              <Icon name="Check" size={18} className="mr-2" />
              Использовать эту
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={restart}
            >
              <Icon name="RotateCcw" size={16} className="mr-2" />
              Проверить заново
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraSetupWizard;