import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ozCall, type OzShot } from "@/lib/marketPrices";

interface Props {
  country: "ru" | "by" | null;
  onClose: (passed: boolean) => void;
}

const STATE_TEXT: Record<string, string> = {
  captcha: "Протяните ползунок, чтобы кусочек пазла встал на место",
  blocked: "Ozon отказал в доступе. Нажмите «Обновить»",
  loading: "Страница загружается...",
  ok: "Пропуск сохранён",
};

type Point = [number, number, number];

const OzonCheckDialog = ({ country, onClose }: Props) => {
  const [shot, setShot] = useState<OzShot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [crop, setCrop] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const path = useRef<Point[]>([]);
  const last = useRef(0);
  const dragging = useRef(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const passed = shot?.state === "ok";

  const call = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (!country) return;
      setBusy(true);
      setError("");
      try {
        const d = await ozCall(action, { country, crop, ...extra });
        if (d.open === false) setError("Окно на сервере закрыто, нажмите «Обновить»");
        else setShot(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setBusy(false);
      }
    },
    [country, crop],
  );

  useEffect(() => {
    if (!country) return;
    setShot(null);
    call("oz_open");
  }, [country]);

  useEffect(() => {
    if (!country || !shot || passed || busy || shot.state === "captcha") return;
    const t = setTimeout(() => call("oz_shot"), 1500);
    return () => clearTimeout(t);
  }, [shot, busy, passed, country, call]);

  useEffect(() => {
    if (country && shot) call("oz_shot");
  }, [crop]);

  useEffect(() => {
    if (!country) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [country]);

  const clip = useRef<OzShot["crop"] | null>(null);
  const startX = useRef(0);
  const sending = useRef<Promise<void>>(Promise.resolve());
  const pressed = useRef(false);

  const send = (phase: "down" | "move" | "up") => {
    const pts = path.current;
    path.current = [];
    if (phase === "move" && pts.length === 0) return;
    const job = sending.current.then(async () => {
      if (phase !== "down" && !pressed.current) return;
      try {
        const d = await ozCall("oz_input", {
          country, crop, phase, path: pts, clip: clip.current, wait: phase === "up" ? 1800 : 0,
        });
        if (phase === "down") pressed.current = true;
        if (phase === "up") pressed.current = false;
        if (d.open !== false) setShot(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    });
    sending.current = job;
    return job;
  };

  const isDragging = !!drag;
  useEffect(() => {
    if (!isDragging) return;
    const t = setInterval(() => send("move"), 600);
    return () => clearInterval(t);
  }, [isDragging]);

  const onDown = (e: React.PointerEvent) => {
    if (busy || !shot || passed || dragging.current) return;
    const p = toPage(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    clip.current = shot.crop;
    startX.current = e.clientX;
    last.current = performance.now();
    path.current = [[p[0], p[1], 0]];
    setDrag({ x: e.clientX, y: e.clientY });
    send("down");
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    const p = toPage(e.clientX, e.clientY);
    if (!p) return;
    const now = performance.now();
    path.current.push([p[0], p[1], Math.round(now - last.current)]);
    last.current = now;
    setDrag({ x: e.clientX, y: e.clientY });
  };

  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    dragging.current = false;
    setDrag(null);
    setBusy(true);
    send("up")?.finally(() => setBusy(false));
  };

  const toPage = (clientX: number, clientY: number): [number, number] | null => {
    const img = imgRef.current;
    const c = (dragging.current && clip.current) || shot?.crop;
    if (!img || !c) return null;
    const r = img.getBoundingClientRect();
    return [
      Math.round(c.x + ((clientX - r.left) * c.w) / r.width),
      Math.round(c.y + ((clientY - r.top) * c.h) / r.height),
    ];
  };

  const offset = drag ? drag.x - startX.current : 0;

  const close = async () => {
    if (country) {
      try {
        await ozCall("oz_close", { country });
      } catch {
        /* окно на сервере закроется само */
      }
    }
    onClose(passed);
  };

  if (!country) return null;

  const title = country === "ru" ? "Проверка Ozon РФ" : "Проверка Ozon РБ";
  const stateText = shot ? STATE_TEXT[shot.state] || "" : "Открываю Ozon на сервере...";

  return createPortal(
    <div
      data-oz-overlay
      className="fixed inset-0 z-[100] flex flex-col bg-background"
      style={{ pointerEvents: "auto", height: "100dvh" }}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2">
        <span className="flex-1 font-semibold">{title}</span>
        <Button size="sm" variant="ghost" className="h-9" onClick={() => setCrop((v) => !v)}>
          <Icon name={crop ? "Maximize2" : "ZoomIn"} size={16} className="mr-1" />
          {crop ? "Весь экран" : "Пазл"}
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={close}>
          <Icon name="X" size={20} />
        </Button>
      </div>

      <div
        className={`px-3 py-2 text-sm ${
          passed ? "bg-emerald-500/15 text-emerald-300" : shot?.state === "blocked" ? "text-amber-300" : "text-muted-foreground"
        }`}
      >
        {passed && <Icon name="CircleCheck" size={16} className="inline mr-1 -mt-0.5" />}
        {stateText}
      </div>
      {error && <div className="px-3 pb-2 text-sm text-red-300">{error}</div>}

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2">
        {shot?.image ? (
          <img
            ref={imgRef}
            src={`data:image/jpeg;base64,${shot.image}`}
            alt="Экран Ozon на сервере"
            draggable={false}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="max-h-full max-w-full select-none rounded-lg"
            style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
          />
        ) : (
          <Icon name="Loader2" size={32} className="animate-spin text-muted-foreground" />
        )}
        {busy && shot && (
          <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-black/60 p-2">
            <Icon name="Loader2" size={18} className="animate-spin text-white" />
          </div>
        )}
        {drag && imgRef.current && (
          <div
            className="pointer-events-none fixed w-0 border-l-2 border-dashed border-primary"
            style={{
              left: drag.x,
              top: imgRef.current.getBoundingClientRect().top,
              height: imgRef.current.getBoundingClientRect().height,
            }}
          >
            <span className="absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {offset >= 0 ? "→" : "←"} {Math.abs(Math.round(offset))}
            </span>
          </div>
        )}
        {drag && (
          <div
            className="pointer-events-none fixed h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/20"
            style={{ left: drag.x, top: drag.y }}
          />
        )}
      </div>

      <div className="flex gap-2 border-t border-white/[0.08] p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <Button variant="outline" className="h-11 flex-1" disabled={busy} onClick={() => call("oz_open")}>
          <Icon name="RefreshCw" size={16} className="mr-1" />
          Обновить
        </Button>
        <Button className="h-11 flex-1" onClick={close}>
          {passed ? "Готово" : "Закрыть"}
        </Button>
      </div>
    </div>,
    document.body,
  );
};

export default OzonCheckDialog;
