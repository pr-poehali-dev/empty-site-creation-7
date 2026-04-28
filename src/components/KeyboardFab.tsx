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
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const panelInputRef = useRef<HTMLInputElement>(null);
  const keyBufferRef = useRef<{ ts: number; count: number }>({ ts: 0, count: 0 });

  useEffect(() => {
    if (!isIOS()) {
      console.log("[KeyboardFab] not iOS, skip");
      return;
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && Date.now() - parseInt(saved, 10) < TTL_MS) {
      console.log("[KeyboardFab] scanner remembered, show button");
      setShow(true);
    }

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA") &&
        t !== hiddenInputRef.current &&
        t !== panelInputRef.current
      ) {
        lastFocusedRef.current = t as HTMLInputElement | HTMLTextAreaElement;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
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

  // КРИТИЧНО: синхронный focus в обработчике касания — единственный способ открыть клавиатуру iOS
  const handleTouchOrClick = (e: React.SyntheticEvent) => {
    console.log("[KeyboardFab] tap event:", e.type);
    const target = lastFocusedRef.current;
    const initial = target?.value || "";
    setDraft(initial);

    const panelInp = panelInputRef.current;
    if (panelInp) {
      console.log("[KeyboardFab] focusing panel input synchronously");
      panelInp.value = initial;
      panelInp.focus();
      try {
        panelInp.setSelectionRange(initial.length, initial.length);
      } catch {
        // ignore
      }
    } else {
      console.log("[KeyboardFab] panel input not in DOM yet, fallback to hidden input");
      hiddenInputRef.current?.focus();
    }
    setPanelOpen(true);
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
      target.dispatchEvent(new Event("change", { bubbles: true }));
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
      {/* Скрытый инпут-донор: всегда в DOM, чтобы можно было синхронно дать ему фокус */}
      <input
        ref={hiddenInputRef}
        type="text"
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "fixed",
          left: "-9999px",
          top: "0",
          width: "1px",
          height: "1px",
          opacity: 0,
        }}
      />

      {/* Панель ввода — всегда смонтирована, скрыта через transform */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2147483647,
          transform: panelOpen ? "translateY(0)" : "translateY(150%)",
          transition: "transform 0.2s ease-out",
          pointerEvents: panelOpen ? "auto" : "none",
        }}
      >
        <div className="bg-background border-t border-border p-3 shadow-2xl">
          <div className="flex items-center gap-2 max-w-md mx-auto">
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
            <button
              type="button"
              onClick={closePanel}
              className="h-11 w-11 rounded-lg bg-muted text-muted-foreground flex items-center justify-center"
              aria-label="Закрыть"
            >
              <Icon name="X" size={18} />
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1.5 px-1 max-w-md mx-auto">
            Ввод копируется в активное поле
          </div>
        </div>
      </div>

      {/* FAB кнопка */}
      <div
        style={{
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 2147483646,
          display: panelOpen ? "none" : "flex",
          alignItems: "center",
          gap: "4px",
          touchAction: "manipulation",
        }}
      >
        <button
          type="button"
          onPointerDown={handleTouchOrClick}
          onClick={handleTouchOrClick}
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition"
          aria-label="Показать клавиатуру"
        >
          <Icon name="Keyboard" size={22} />
        </button>
        <button
          type="button"
          onClick={hide}
          className="w-6 h-6 rounded-full bg-muted text-muted-foreground shadow flex items-center justify-center"
          aria-label="Скрыть"
        >
          <Icon name="X" size={12} />
        </button>
      </div>
    </>
  );
}
