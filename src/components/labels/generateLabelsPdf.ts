import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import { LabelRow } from "./LabelTemplateEditor";
import { LabelProduct } from "@/pages/Labels";

export type PdfMode = "roll" | "sheet";
export type SheetSize = "a3" | "a4" | "a5" | "a6";

export const SHEET_SIZES: Record<SheetSize, { w: number; h: number; label: string }> = {
  a3: { w: 297, h: 420, label: "A3" },
  a4: { w: 210, h: 297, label: "A4" },
  a5: { w: 148, h: 210, label: "A5" },
  a6: { w: 105, h: 148, label: "A6" },
};

interface Options {
  products: LabelProduct[];
  rows: LabelRow[];
  widthMm: number;
  heightMm: number;
  mode: PdfMode;
  sheet?: SheetSize;
  userName?: string;
  cutMarks?: boolean;
}

const SHEET_MARGIN = 8;
const CELL_GAP = 2;
const PAD = 1;

const formatPrice = (v: number | null | undefined): string => {
  if (v == null) return "";
  const n = Number(v);
  if (isNaN(n)) return "";
  return n.toLocaleString("ru-RU");
};

const renderTokens = (template: string, p: LabelProduct): string =>
  (template || "")
    .replace(/\{товар\}/g, p.name || "")
    .replace(/\{артикул\}/g, p.article || "")
    .replace(/\{бренд\}/g, p.brand || "")
    .replace(/\{розничная_цена\}/g, formatPrice(p.price_retail))
    .replace(/\{оптовая_цена\}/g, formatPrice(p.price_wholesale))
    .replace(/\{штрихкод\}/g, (p.barcodes && p.barcodes[0]) || "");

const fetchFontBase64 = async (url: string): Promise<string> => {
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

let fontsLoaded: { regular: string; bold: string } | null = null;

const ensureFonts = async () => {
  if (fontsLoaded) return fontsLoaded;
  const [regular, bold] = await Promise.all([
    fetchFontBase64("/fonts/Roboto-Regular.ttf"),
    fetchFontBase64("/fonts/Roboto-Bold.ttf"),
  ]);
  fontsLoaded = { regular, bold };
  return fontsLoaded;
};

const registerFonts = (doc: jsPDF, fonts: { regular: string; bold: string }) => {
  doc.addFileToVFS("Roboto-Regular.ttf", fonts.regular);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", fonts.bold);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
};

const barcodeDataUrl = (value: string): { url: string; ratio: number } | null => {
  if (!value) return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format: value.length === 13 ? "EAN13" : "CODE128",
      width: 2,
      height: 60,
      displayValue: false,
      margin: 0,
    });
    return { url: canvas.toDataURL("image/png"), ratio: canvas.width / canvas.height };
  } catch {
    return null;
  }
};

const MIN_BARCODE_MM = 8;

const measureTexts = (
  doc: jsPDF,
  product: LabelProduct,
  rows: LabelRow[],
  innerW: number,
  shrink: number,
): number => {
  let total = 0;
  for (const r of rows) {
    if (r.type === "spacer") total += r.heightMm ?? 2;
    else if (r.type === "line") total += Math.max(0.1, r.thicknessMm ?? 0.3) + 0.6;
    else if (r.type === "text") {
      const size = (r.fontSize || 8) * shrink;
      const lineH = size * 0.3528 * 1.15;
      if (r.wrap) {
        doc.setFont("Roboto", r.bold ? "bold" : "normal");
        doc.setFontSize(size);
        const parts = doc.splitTextToSize(renderTokens(r.content, product), innerW);
        total += lineH * Math.max(1, parts.length);
      } else {
        total += lineH;
      }
      total += 0.3;
    }
  }
  return total;
};

const drawLabel = (
  doc: jsPDF,
  product: LabelProduct,
  rows: LabelRow[],
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const innerX = x + PAD;
  const innerW = w - PAD * 2;
  let cursor = y + PAD;
  const bottom = y + h - PAD;

  const barcodeList = rows.filter((r) => r.type === "barcode");
  const barcodeRows = barcodeList.length;
  const available = h - PAD * 2;
  const captionsAt = (s: number) =>
    barcodeList.reduce((sum, r) => sum + (r.fontSize || 10) * s * 0.3528 * 1.15, 0);

  let shrink = 1;
  while (shrink > 0.55) {
    const used = measureTexts(doc, product, rows, innerW, shrink);
    const reserved = barcodeRows * MIN_BARCODE_MM + captionsAt(shrink);
    if (used + reserved <= available) break;
    shrink -= 0.05;
  }
  shrink = Math.max(0.55, shrink);

  const fixedHeight = measureTexts(doc, product, rows, innerW, shrink);
  const barcodeHeight =
    barcodeRows > 0
      ? Math.max(
          MIN_BARCODE_MM + captionsAt(shrink) / barcodeRows,
          (available - fixedHeight) / barcodeRows,
        )
      : 0;

  for (const r of rows) {
    if (cursor >= bottom) break;

    if (r.type === "spacer") {
      cursor += r.heightMm ?? 2;
      continue;
    }

    if (r.type === "line") {
      const th = Math.max(0.1, r.thicknessMm ?? 0.3);
      const ml = r.marginLeftMm ?? 0;
      const mr = r.marginRightMm ?? 0;
      const lineW = Math.max(1, innerW - ml - mr);
      const gap = r.dashGapMm ?? 0;
      const dash = r.dashLenMm ?? 0;
      let lx = innerX + ml;
      if (r.align === "center") lx = innerX + ml + (innerW - ml - mr - lineW) / 2;
      else if (r.align === "right") lx = innerX + innerW - mr - lineW;
      doc.setLineWidth(th);
      doc.setDrawColor(0);
      if (gap > 0 || dash > 0) {
        doc.setLineDashPattern([Math.max(dash, 0.2), Math.max(gap, 0.2)], 0);
      } else {
        doc.setLineDashPattern([], 0);
      }
      cursor += th / 2 + 0.3;
      doc.line(lx, cursor, lx + lineW, cursor);
      doc.setLineDashPattern([], 0);
      cursor += th / 2 + 0.3;
      continue;
    }

    if (r.type === "barcode") {
      const value = renderTokens(r.content || "{штрихкод}", product);
      const bc = barcodeDataUrl(value);
      const total = Math.min(barcodeHeight, bottom - cursor);
      const capSize = (r.fontSize || 10) * shrink;
      const capH = capSize * 0.3528 * 1.15;
      const barsH = Math.max(2, total - capH);
      if (bc && barsH > 2) {
        let bw = barsH * bc.ratio;
        let realH = barsH;
        if (bw > innerW) {
          bw = innerW;
          realH = bw / bc.ratio;
        }
        const bx = innerX + (innerW - bw) / 2;
        doc.addImage(bc.url, "PNG", bx, cursor, bw, realH);

        doc.setFont("Roboto", r.bold ? "bold" : "normal");
        doc.setFontSize(capSize);
        doc.setTextColor(0);
        doc.text(value, innerX + innerW / 2, cursor + realH + capH * 0.8, {
          align: "center",
        });
      }
      cursor += total;
      continue;
    }

    const size = (r.fontSize || 8) * shrink;
    doc.setFont("Roboto", r.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(0);
    const text = renderTokens(r.content, product);
    const lineH = size * 0.3528 * 1.15;
    const align = r.align === "center" ? "center" : r.align === "right" ? "right" : "left";
    const tx =
      align === "center" ? innerX + innerW / 2 : align === "right" ? innerX + innerW : innerX;

    if (r.wrap) {
      const parts: string[] = doc.splitTextToSize(text, innerW);
      for (let i = 0; i < parts.length; i++) {
        if (cursor + lineH > bottom) break;
        const isLastFitting = cursor + lineH * 2 > bottom && i < parts.length - 1;
        let part = parts[i];
        if (isLastFitting) {
          while (part && doc.getTextWidth(part + "…") > innerW) part = part.slice(0, -1);
          part += "…";
        }
        doc.text(part, tx, cursor + lineH * 0.8, { align });
        cursor += lineH;
      }
    } else {
      let out = text;
      while (out && doc.getTextWidth(out) > innerW) out = out.slice(0, -1);
      doc.text(out, tx, cursor + lineH * 0.8, { align });
      cursor += lineH;
    }
    cursor += 0.3;
  }
};

const buildFileName = (
  count: number,
  widthMm: number,
  heightMm: number,
  mode: PdfMode,
  sheet: SheetSize | undefined,
  userName?: string,
): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}-${p(d.getMinutes())}`;
  const who = userName ? ` ${userName}` : "";
  const size =
    mode === "sheet" && sheet
      ? `${SHEET_SIZES[sheet].label} ${widthMm}x${heightMm}`
      : `${widthMm}x${heightMm}`;
  return `Этикетки${who} ${count} шт ${size} ${stamp}.pdf`;
};

export const generateLabelsPdf = async (opts: Options): Promise<void> => {
  const {
    products,
    rows,
    widthMm,
    heightMm,
    mode,
    sheet = "a4",
    userName,
    cutMarks = true,
  } = opts;
  if (products.length === 0) return;

  const fonts = await ensureFonts();

  if (mode === "roll") {
    const doc = new jsPDF({
      unit: "mm",
      format: [widthMm, heightMm],
      orientation: widthMm >= heightMm ? "landscape" : "portrait",
    });
    registerFonts(doc, fonts);
    products.forEach((p, i) => {
      if (i > 0) doc.addPage([widthMm, heightMm], widthMm >= heightMm ? "landscape" : "portrait");
      drawLabel(doc, p, rows, 0, 0, widthMm, heightMm);
    });
    doc.save(buildFileName(products.length, widthMm, heightMm, mode, undefined, userName));
    return;
  }

  const s = SHEET_SIZES[sheet];
  const doc = new jsPDF({ unit: "mm", format: [s.w, s.h], orientation: "portrait" });
  registerFonts(doc, fonts);

  const usableW = s.w - SHEET_MARGIN * 2;
  const usableH = s.h - SHEET_MARGIN * 2;
  const cols = Math.max(1, Math.floor((usableW + CELL_GAP) / (widthMm + CELL_GAP)));
  const rowsPerPage = Math.max(1, Math.floor((usableH + CELL_GAP) / (heightMm + CELL_GAP)));
  const perPage = cols * rowsPerPage;

  products.forEach((p, i) => {
    const onPage = i % perPage;
    if (i > 0 && onPage === 0) doc.addPage([s.w, s.h], "portrait");
    const col = onPage % cols;
    const rowIdx = Math.floor(onPage / cols);
    const x = SHEET_MARGIN + col * (widthMm + CELL_GAP);
    const y = SHEET_MARGIN + rowIdx * (heightMm + CELL_GAP);
    if (cutMarks) {
      doc.setLineWidth(0.1);
      doc.setDrawColor(180);
      doc.setLineDashPattern([], 0);
      doc.rect(x, y, widthMm, heightMm);
    }
    drawLabel(doc, p, rows, x, y, widthMm, heightMm);
  });

  doc.save(buildFileName(products.length, widthMm, heightMm, mode, sheet, userName));
};