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

const setReactValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

export default function KeyboardFab() {
  const [show, setShow] = useState(false);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(HIDE_KEY) === "1");
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const lastFocusedRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const panelInputRef = useRef<HTMLInputElement>(null);
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
        setDraft((t as HTMLInputElement).value || "");
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

  const openPanel = () => {
    const target = lastFocusedRef.current;
    if (target) {
      setDraft(target.value || "");
    } else {
      setDraft("");
    }
    setPanelOpen(true);
    setTimeout(() => panelInputRef.current?.focus(), 30);
  };

  const closePanel = () => {
    setPanelOpen(false);
  };

  const onDraftChange = (val: string) => {
    setDraft(val);
    const target = lastFocusedRef.current;
    if (target) setReactValue(target, val);
  };

  const submitDraft = () => {
    const target = lastFocusedRef.current;
    if (target) {
      setReactValue(target, draft);
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", bubbles: true }));
      target.dispatchEvent(
        new Event("change", { bubbles: true }),
      );
    }
    setPanelOpen(false);
  };

  const hide = (e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.setItem(HIDE_KEY, "1");
    setHidden(true);
    setShow(false);
  };

  if (!show || hidden) return null;

  return (
    <>
      <div
        className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1"
        style={{ touchAction: "manipulation" }}
      >
        <button
          type="button"
          onClick={openPanel}
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

      {panelOpen && (
        <div
          className="fixed inset-0 z-[10000] bg-black/30 flex items-end sm:items-center justify-center"
          onClick={closePanel}
        >
          <div
            className="w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <input
                ref={panelInputRef}
                type="text"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitDraft();
                  }
                }}
                placeholder="Введите текст"
                className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-base outline-none focus:ring-2 focus:ring-primary"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={submitDraft}
                className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                Готово
              </button>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2 px-1">
              Ввод копируется в активное поле
            </div>
          </div>
        </div>
      )}
    </>
  );
}
