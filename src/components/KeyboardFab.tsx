import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import VirtualKeyboard from "./VirtualKeyboard";
import { toast } from "@/hooks/use-toast";

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
  const [target, setTarget] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const lastFocusedRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
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
        lastFocusedRef.current = t as HTMLInputElement | HTMLTextAreaElement;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const isInField = tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA");
      const now = Date.now();
      const buf = keyBufferRef.current;

      if (now - buf.ts < 50) buf.count += 1;
      else buf.count = 1;
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

  const openKeyboard = () => {
    const t = lastFocusedRef.current;
    if (!t) {
      toast({
        title: "Сначала тапни по полю ввода",
        description: "Затем нажми эту кнопку, чтобы напечатать",
      });
      return;
    }
    setTarget(t);
  };

  const closeKeyboard = () => setTarget(null);

  const hideFab = (e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.setItem(HIDE_KEY, "1");
    setHidden(true);
    setShow(false);
  };

  if (!show || hidden) return null;

  return (
    <>
      {target && <VirtualKeyboard target={target} onClose={closeKeyboard} />}

      {!target && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            zIndex: 2147483646,
            display: "flex",
            alignItems: "center",
            gap: 4,
            touchAction: "manipulation",
          }}
        >
          <button
            type="button"
            onClick={openKeyboard}
            className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition"
            aria-label="Показать клавиатуру"
          >
            <Icon name="Keyboard" size={22} />
          </button>
          <button
            type="button"
            onClick={hideFab}
            className="w-6 h-6 rounded-full bg-muted text-muted-foreground shadow flex items-center justify-center"
            aria-label="Скрыть"
          >
            <Icon name="X" size={12} />
          </button>
        </div>
      )}
    </>
  );
}
