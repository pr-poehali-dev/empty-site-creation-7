import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { LabelRow } from "./LabelTemplateEditor";
import { LabelProduct } from "@/pages/Labels";

interface Props {
  product: LabelProduct;
  rows: LabelRow[];
  widthMm: number;
  heightMm: number;
  scale?: number;
}

const formatPrice = (v: number | null | undefined): string => {
  if (v == null) return "";
  const n = Number(v);
  if (isNaN(n)) return "";
  return n.toLocaleString("ru-RU");
};

export const renderTokens = (template: string, p: LabelProduct): string => {
  return template
    .replace(/\{товар\}/g, p.name || "")
    .replace(/\{артикул\}/g, p.article || "")
    .replace(/\{бренд\}/g, p.brand || "")
    .replace(/\{розничная_цена\}/g, formatPrice(p.price_retail))
    .replace(/\{оптовая_цена\}/g, formatPrice(p.price_wholesale))
    .replace(/\{штрихкод\}/g, p.external_id || "");
};

const Barcode = ({ value, height }: { value: string; height: number }) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: value.length === 13 ? "EAN13" : "CODE128",
        width: 1.2,
        height,
        displayValue: true,
        fontSize: 10,
        margin: 0,
      });
    } catch {
      // некорректный штрихкод — рисуем placeholder
      if (ref.current) ref.current.innerHTML = "";
    }
  }, [value, height]);
  if (!value) return <div className="text-[8px] text-muted-foreground">нет штрихкода</div>;
  return <svg ref={ref} />;
};

const LabelPreview = ({ product, rows, widthMm, heightMm, scale = 4 }: Props) => {
  const widthPx = widthMm * scale;
  const heightPx = heightMm * scale;

  return (
    <div
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
              style={{ flex: 1 }}
            >
              <Barcode value={value} height={Math.max(20, scale * 6)} />
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
        const text = renderTokens(row.content, product);
        return (
          <div
            key={row.id}
            style={{
              fontSize: `${row.fontSize * (scale / 4)}px`,
              fontWeight: row.bold ? 700 : 400,
              textAlign: row.align,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
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
