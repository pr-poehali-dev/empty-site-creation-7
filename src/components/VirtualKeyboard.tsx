import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";

interface Props {
  target: HTMLInputElement | HTMLTextAreaElement;
  onClose: () => void;
}

type Layout = "ru" | "en" | "num";

const LAYOUTS: Record<Layout, string[][]> = {
  en: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ],
  ru: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х"],
    ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
    ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю"],
  ],
  num: [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "-"],
  ],
};

const setReactValue = (
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

export default function VirtualKeyboard({ target, onClose }: Props) {
  const initialLayout: Layout =
    target.type === "number" || target.inputMode === "numeric" ? "num" : "ru";
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const [shift, setShift] = useState(false);
  const [preview, setPreview] = useState(target.value || "");

  useEffect(() => {
    const handler = () => setPreview(target.value || "");
    target.addEventListener("input", handler);
    return () => target.removeEventListener("input", handler);
  }, [target]);

  useEffect(() => {
    try {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      // ignore
    }
  }, [target]);

  const insert = (ch: string) => {
    const cur = target.value || "";
    const c = shift && layout !== "num" ? ch.toUpperCase() : ch;
    const newVal = cur + c;
    setReactValue(target, newVal);
    setPreview(newVal);
    if (shift && layout !== "num") setShift(false);
  };

  const backspace = () => {
    const cur = target.value || "";
    if (!cur) return;
    const newVal = cur.slice(0, -1);
    setReactValue(target, newVal);
    setPreview(newVal);
  };

  const clearAll = () => {
    setReactValue(target, "");
    setPreview("");
  };

  const space = () => {
    const cur = target.value || "";
    const newVal = cur + " ";
    setReactValue(target, newVal);
    setPreview(newVal);
  };

  const submit = () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    target.dispatchEvent(new Event("change", { bubbles: true }));
    onClose();
  };

  const cycleLayout = () => {
    setLayout((l) => (l === "ru" ? "en" : l === "en" ? "num" : "ru"));
  };

  const layoutLabel = layout === "ru" ? "АБВ" : layout === "en" ? "ABC" : "123";

  // Чтобы фокус не уходил с target при тапе по клавишам
  const noFocusSteal = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
  };

  const rows = LAYOUTS[layout];

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483647,
        background: "hsl(var(--background))",
        borderTop: "1px solid hsl(var(--border))",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
        userSelect: "none",
        touchAction: "manipulation",
      }}
      onMouseDown={noFocusSteal}
      onTouchStart={noFocusSteal}
    >
      {/* Превью */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          borderBottom: "1px solid hsl(var(--border))",
          minHeight: 36,
        }}
      >
        <div
          style={{
            flex: 1,
            fontSize: 14,
            padding: "4px 8px",
            background: "hsl(var(--muted))",
            borderRadius: 6,
            minHeight: 24,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            direction: "rtl",
            textAlign: "left",
          }}
        >
          <span style={{ direction: "ltr", unicodeBidi: "bidi-override" }}>
            {preview || "\u00A0"}
          </span>
        </div>
        <button
          type="button"
          onClick={clearAll}
          style={{
            padding: "4px 8px",
            fontSize: 12,
            color: "hsl(var(--muted-foreground))",
            background: "transparent",
            border: "none",
          }}
        >
          Очистить
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "hsl(var(--muted))",
            borderRadius: 6,
            border: "none",
          }}
          aria-label="Закрыть"
        >
          <Icon name="X" size={14} />
        </button>
      </div>

      {/* Клавиши */}
      <div style={{ padding: 4 }}>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 3,
              marginBottom: 3,
              justifyContent: "center",
            }}
          >
            {row.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => insert(ch)}
                style={{
                  flex: 1,
                  maxWidth: 44,
                  height: 40,
                  fontSize: 16,
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontWeight: 500,
                }}
              >
                {shift && layout !== "num" ? ch.toUpperCase() : ch}
              </button>
            ))}
            {/* Backspace в правом конце последнего ряда букв */}
            {layout !== "num" && i === rows.length - 1 && (
              <button
                type="button"
                onClick={backspace}
                style={{
                  width: 56,
                  height: 40,
                  background: "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Стереть"
              >
                <Icon name="Delete" size={18} />
              </button>
            )}
          </div>
        ))}

        {/* Нижний ряд: shift / переключатель / пробел / готово */}
        <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
          {layout !== "num" && (
            <button
              type="button"
              onClick={() => setShift((s) => !s)}
              style={{
                width: 48,
                height: 42,
                background: shift ? "hsl(var(--primary))" : "hsl(var(--muted))",
                color: shift
                  ? "hsl(var(--primary-foreground))"
                  : "inherit",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Shift"
            >
              <Icon name="ArrowBigUp" size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={cycleLayout}
            style={{
              width: 56,
              height: 42,
              fontSize: 12,
              background: "hsl(var(--muted))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            {layoutLabel}
          </button>
          {layout === "num" ? (
            <button
              type="button"
              onClick={backspace}
              style={{
                flex: 1,
                height: 42,
                background: "hsl(var(--muted))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Стереть"
            >
              <Icon name="Delete" size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={space}
              style={{
                flex: 1,
                height: 42,
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
                color: "hsl(var(--muted-foreground))",
              }}
            >
              пробел
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            style={{
              width: 80,
              height: 42,
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
