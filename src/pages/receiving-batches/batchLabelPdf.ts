import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export interface BatchLabelData {
  number: string;
  code: string;
  link: string;
  date: string;
  warehouse: string;
  qty: number;
  counterparty: string | null;
}

export interface LabelSize {
  w: number;
  h: number;
}

export const LABEL_SIZES: LabelSize[] = [
  { w: 58, h: 40 },
  { w: 40, h: 30 },
  { w: 58, h: 60 },
  { w: 75, h: 120 },
  { w: 100, h: 70 },
  { w: 100, h: 150 },
];

const toBase64 = async (url: string) => {
  const buf = await (await fetch(url)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

let fonts: { r: string; b: string } | null = null;
const loadFonts = async () => {
  if (!fonts) {
    const [r, b] = await Promise.all([
      toBase64("/fonts/Roboto-Regular.ttf"),
      toBase64("/fonts/Roboto-Bold.ttf"),
    ]);
    fonts = { r, b };
  }
  return fonts;
};

const barcode = (value: string) => {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: 3,
    height: 80,
    displayValue: false,
    margin: 0,
  });
  return canvas.toDataURL("image/png");
};

/** Самый крупный кегль, при котором строка влезает в ширину. */
const fit = (doc: jsPDF, text: string, maxW: number, maxPt: number, minPt = 5) => {
  let pt = maxPt;
  while (pt > minPt) {
    doc.setFontSize(pt);
    if (doc.getTextWidth(text) <= maxW) break;
    pt -= 0.5;
  }
  doc.setFontSize(pt);
  return pt;
};

const PT_MM = 0.3528;

/** Одна наклейка партии: номер крупно, QR со ссылкой, штрихкод кода партии и реквизиты. */
export const buildBatchLabel = async (d: BatchLabelData, size: LabelSize): Promise<jsPDF> => {
  const { w, h } = size;
  const doc = new jsPDF({
    unit: "mm",
    format: [w, h],
    orientation: w >= h ? "landscape" : "portrait",
  });
  const f = await loadFonts();
  doc.addFileToVFS("R.ttf", f.r);
  doc.addFont("R.ttf", "Roboto", "normal");
  doc.addFileToVFS("B.ttf", f.b);
  doc.addFont("B.ttf", "Roboto", "bold");

  const pad = Math.max(1.5, Math.min(w, h) * 0.05);
  const qrUrl = await QRCode.toDataURL(d.link, { margin: 0, width: 600, errorCorrectionLevel: "M" });
  const wide = w / h >= 1.15;

  let tx: number, ty: number, tw: number, bottom: number;
  if (wide) {
    const qr = h - pad * 2;
    doc.addImage(qrUrl, "PNG", pad, pad, qr, qr);
    tx = pad * 2 + qr;
    ty = pad;
    tw = w - tx - pad;
    bottom = h - pad;
  } else {
    const qr = Math.min(w - pad * 2, h * 0.42);
    doc.addImage(qrUrl, "PNG", (w - qr) / 2, pad, qr, qr);
    tx = pad;
    ty = pad * 2 + qr;
    tw = w - pad * 2;
    bottom = h - pad;
  }

  const bcH = Math.max(4, Math.min((bottom - ty) * 0.22, 14));
  const bcTextPt = Math.max(5, Math.min(9, bcH * 0.9));
  const textBottom = bottom - bcH - bcTextPt * PT_MM - 1;
  const lineGap = 1.15;

  doc.setFont("Roboto", "bold");
  const parts = d.number.split("/");
  const head = parts.slice(0, 2).join("/");
  const tail = parts.slice(2).join("/");
  const space = textBottom - ty;
  const maxNumPt = Math.min(40, (space * 0.42) / PT_MM / lineGap / 2);
  const p1 = fit(doc, head, tw, maxNumPt);
  let y = ty + p1 * PT_MM;
  doc.text(head, tx, y);
  const p2 = fit(doc, tail, tw, p1);
  y += p2 * PT_MM * lineGap;
  doc.text(tail, tx, y);

  doc.setFont("Roboto", "normal");
  const infoPt = Math.max(5, Math.min(12, p2 * 0.55));
  const lines = [
    d.date,
    `${d.qty} шт.`,
    d.counterparty ? d.counterparty : "",
  ].filter(Boolean);
  for (const line of lines) {
    const pt = fit(doc, line, tw, infoPt);
    const next = y + pt * PT_MM * 1.35;
    if (next > textBottom) break;
    y = next;
    doc.text(line, tx, y);
  }

  const bcW = Math.min(tw, w - pad * 2);
  const bx = wide ? tx : pad;
  doc.addImage(barcode(d.code), "PNG", bx, bottom - bcH - bcTextPt * PT_MM - 0.5, bcW, bcH);
  doc.setFontSize(bcTextPt);
  doc.text(d.code, bx + bcW / 2, bottom, { align: "center" });
  return doc;
};
