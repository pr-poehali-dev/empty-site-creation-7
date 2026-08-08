import { useEffect, useLayoutEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { LabelRow } from "./LabelTemplateEditor";
import { stripUsedSuffix } from "./stripUsed";
import { formatDate } from "./formatDate";
import { LabelProduct } from "@/pages/Labels";

interface Props {
  product: LabelProduct;
  rows: LabelRow[];
  widthMm: number;
  heightMm: number;
  scale?: number;
  labelDate?: string;
}

const formatPrice = (v: number | null | undefined): string => {
  if (v == null) return "";
  const n = Number(v);
  if (isNaN(n)) return "";
  return n.toLocaleString("ru-RU");
};

export const renderTokens = (
  template: string,
  p: LabelProduct,
  hideUsed?: boolean,
  labelDate?: string,
): string => {
  return template
    .replace(/\{дата\}/g, formatDate(labelDate))
    .replace(/\{товар\}/g, hideUsed ? stripUsedSuffix(p.name || "") : p.name || "")
    .replace(/\{артикул\}/g, p.article || "")
    .replace(/\{бренд\}/g, p.brand || "")
    .replace(/\{розничная_цена\}/g, formatPrice(p.price_retail))
    .replace(/\{оптовая_цена\}/g, formatPrice(p.price_wholesale))
    .replace(/\{штрихкод\}/g, (p.barcodes && p.barcodes[0]) || "");
};

const Barcode = ({
  value,
  height,
  fontSize,
  bold,
}: {
  value: string;
  height: number;
  fontSize: number;
  bold?: boolean;
}) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: value.length === 13 ? "EAN13" : "CODE128",
        width: 1.2,
        height,
        displayValue: false,
        flat: true,
        margin: 0,
      });
    } catch {
      // некорректный штрихкод — рисуем placeholder
      if (ref.current) ref.current.innerHTML = "";
    }
  }, [value, height]);
  if (!value) return <div className="text-[8px] text-muted-foreground">нет штрихкода</div>;
  return (
    <div className="flex flex-col items-center">
      <svg ref={ref} />
      <div
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: bold ? 700 : 400,
          lineHeight: 1.1,
          letterSpacing: "0.08em",
        }}
      >
        {value}
      </div>
    </div>
  );
};

const LabelPreview = ({ product, rows, widthMm, heightMm, scale = 4, labelDate }: Props) => {
  const widthPx = widthMm * scale;
  const heightPx = heightMm * scale;
  const boxRef = useRef<HTMLDivElement>(null);
  const [shrink, setShrink] = useState(1);
  const key = JSON.stringify([rows, product.id, product.name, widthMm, heightMm, scale]);

  useLayoutEffect(() => {
    setShrink(1);
  }, [key]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow > 1 && shrink > 0.55) {
      setShrink((s) => Math.max(0.55, s - 0.05));
    }
  });

  return (
    <div
      ref={boxRef}
      className="bg-white text-black border border-border overflow-hidden flex flex-col"
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        padding: `${scale * 1}px`,
        gap: `${scale * 0.3}px`,
      }}
    >
      {rows.map((row) => {
        if (row.type === "barcode") {
          const value = renderTokens(row.content || "{штрихкод}", product);
          return (
            <div
              key={row.id}
              className="flex items-center justify-center"
              style={{ flex: 1, minHeight: `${scale * 5 * shrink}px` }}
            >
              <Barcode
                value={value}
                height={Math.max(16, scale * 6 * shrink)}
                fontSize={Math.max(4, (row.fontSize || 10) * (scale / 4) * shrink)}
                bold={row.bold}
              />
            </div>
          );
        }
        if (row.type === "spacer") {
          return (
            <div
              key={row.id}
              style={{ height: `${(row.heightMm ?? 2) * scale}px`, flexShrink: 0 }}
            />
          );
        }
        if (row.type === "line") {
          const thickness = Math.max(0.1, row.thicknessMm ?? 0.3) * scale;
          const gap = row.dashGapMm ?? 0;
          const dash = row.dashLenMm ?? 0;
          const dashed = gap > 0 || dash > 0;
          const justify =
            row.align === "left" ? "flex-start" : row.align === "right" ? "flex-end" : "center";
          return (
            <div
              key={row.id}
              style={{
                display: "flex",
                justifyContent: justify,
                paddingLeft: `${(row.marginLeftMm ?? 0) * scale}px`,
                paddingRight: `${(row.marginRightMm ?? 0) * scale}px`,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${thickness}px`,
                  ...(dashed
                    ? {
                        backgroundImage: `repeating-linear-gradient(to right, #000 0, #000 ${Math.max(dash, 0.2) * scale}px, transparent ${Math.max(dash, 0.2) * scale}px, transparent ${(Math.max(dash, 0.2) + Math.max(gap, 0.2)) * scale}px)`,
                      }
                    : { backgroundColor: "#000" }),
                }}
              />
            </div>
          );
        }
        if (row.type === "qr") {
          // TODO: добавить рендер QR (заложено на будущее)
          return (
            <div key={row.id} className="text-[8px] text-muted-foreground text-center">
              [QR]
            </div>
          );
        }
        if (row.type === "group") {
          const cells = row.cells || [];
          if (cells.length === 0) return null;
          const sep = row.separator && row.separator !== "none" ? row.separator : "";
          const defPct = 100 / cells.length;
          return (
            <div key={row.id} style={{ display: "flex", flexShrink: 0, alignItems: "baseline" }}>
              {cells.map((cell, ci) => (
                <div key={cell.id} style={{ display: "flex", alignItems: "baseline", width: `${cell.widthPct ?? defPct}%` }}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: `${cell.fontSize * (scale / 4) * shrink}px`,
                      fontWeight: cell.bold ? 700 : 400,
                      textAlign: cell.align,
                      lineHeight: 1.1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {renderTokens(cell.content, product, cell.hideUsed, labelDate)}
                  </div>
                  {sep && ci < cells.length - 1 && (
                    <span
                      style={{
                        fontSize: `${cell.fontSize * (scale / 4) * shrink}px`,
                        padding: `0 ${scale * 0.3}px`,
                        lineHeight: 1.1,
                      }}
                    >
                      {sep}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        }
        const text = renderTokens(row.content, product, row.hideUsed, labelDate);
        return (
          <div
            key={row.id}
            style={{
              fontSize: `${row.fontSize * (scale / 4) * shrink}px`,
              flexShrink: 0,
              fontWeight: row.bold ? 700 : 400,
              textAlign: row.align,
              lineHeight: 1.1,
              ...(row.wrap
                ? {
                    whiteSpace: "normal",
                    overflowWrap: "break-word",
                    wordBreak: "break-word",
                  }
                : {
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }),
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
};

export default LabelPreview;