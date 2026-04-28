import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";

const STORAGE_KEY = "scanner_detected_at";
const HIDE_KEY = "keyboard_fab_hidden";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const isIOS = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
};

export default function KeyboardFab() {
  const [show, setShow] = useState(false);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(HIDE_KEY) === "1");
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const keyBufferRef = useRef<{ ts: number; count: number }>({ ts: 0, count: 0 });

  useEffect(() => {
    if (!isIOS()) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && Date.now() - parseInt(saved, 10) < TTL_MS) {
      setShow(true);
    }

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
        lastFocusedRef.current = t;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      const now = Date.now();
      const buf = keyBufferRef.current;

      if (now - buf.ts < 50) {
        buf.count += 1;
      } else {
        buf.count = 1;
      }
      buf.ts = now;

      const fastBurst = buf.count >= 6;
      const keyOutsideField = !isInField && e.key.length === 1;

      if (fastBurst || keyOutsideField) {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
        if (!hidden) setShow(true);
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [hidden]);

  const openKeyboard = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const target = lastFocusedRef.current;
    if (!target) return;
    try {
      target.blur();
      setTimeout(() => {
        target.focus();
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          const len = target.value.length;
          target.setSelectionRange(len, len);
        }
      }, 0);
    } catch {
      // ignore
    }
  };

  const hide = (e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.setItem(HIDE_KEY, "1");
    setHidden(true);
    setShow(false);
  };

  if (!show || hidden) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1"
      style={{ touchAction: "manipulation" }}
    >
      <button
        type="button"
        onTouchEnd={openKeyboard}
        onClick={openKeyboard}
        className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center opacity-80 active:opacity-100 active:scale-95 transition"
        aria-label="Показать клавиатуру"
      >
        <Icon name="Keyboard" size={22} />
      </button>
      <button
        type="button"
        onClick={hide}
        className="w-6 h-6 rounded-full bg-muted text-muted-foreground shadow flex items-center justify-center text-xs"
        aria-label="Скрыть"
      >
        <Icon name="X" size={12} />
      </button>
    </div>
  );
}
