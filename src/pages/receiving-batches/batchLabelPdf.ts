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

export interface PresetSize extends LabelSize {
  name?: string;
}

export const LABEL_SIZES: PresetSize[] = [
  { w: 58, h: 40 },
  { w: 40, h: 30 },
  { w: 58, h: 60 },
  { w: 75, h: 120 },
  { w: 100, h: 70 },
  { w: 100, h: 150 },
  { w: 148, h: 210, name: "А5" },
  { w: 210, h: 297, name: "А4" },
];

export type Orient = "portrait" | "landscape";

export const orientSize = (s: LabelSize, o: Orient): LabelSize => {
  const a = Math.min(s.w, s.h);
  const b = Math.max(s.w, s.h);
  return o === "landscape" ? { w: b, h: a } : { w: a, h: b };
};

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

type Mode = "wide" | "tall" | "square";

const modeOf = (w: number, h: number): Mode => {
  const r = w / h;
  if (r >= 1.3) return "wide";
  if (r <= 0.77) return "tall";
  return "square";
};

/** Одна наклейка партии: номер крупно, QR со ссылкой, штрихкод кода партии и реквизиты.
 * Раскладка по пропорциям листа: широкий — QR слева, высокий — QR сверху,
 * почти квадрат — QR сверху слева, текст справа и ниже. Всё масштабируется от размера листа. */
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

  const s = Math.min(w, h);
  const pad = Math.max(1.5, s * 0.05);
  const gap = pad * 0.8;
  const mode = modeOf(w, h);
  const qrUrl = await QRCode.toDataURL(d.link, { margin: 0, width: 800, errorCorrectionLevel: "M" });

  let qr: number, qx: number;
  if (mode === "wide") {
    qr = Math.min(h - pad * 2, w * 0.45);
    qx = pad;
  } else if (mode === "tall") {
    qr = Math.min(w - pad * 2, h * 0.42);
    qx = (w - qr) / 2;
  } else {
    qr = s * 0.44;
    qx = pad;
  }
  doc.addImage(qrUrl, "PNG", qx, pad, qr, qr);
  const qrBottom = pad + qr;
  const sideX = qx + qr + gap;
  const sideW = w - sideX - pad;
  const fullW = w - pad * 2;

  const bottom = h - pad;
  const bcTextPt = Math.max(5, s * 0.1);
  const bcBase = mode === "wide" ? h : s;
  const bcFree = bottom - bcTextPt * PT_MM - 0.5 - qrBottom - gap * 1.5;
  const bcH =
    mode === "square" ? Math.max(4, Math.min(s * 0.24, bcFree)) : Math.max(4, bcBase * 0.14);
  const bx = mode === "wide" ? sideX : pad;
  const bcW = mode === "wide" ? sideW : fullW;
  const bcTop = bottom - bcTextPt * PT_MM - 0.5 - bcH;
  const textBottom = bcTop - gap * 0.6;

  const startY = mode === "tall" ? qrBottom + gap : pad;
  const area = (y: number) =>
    mode === "wide" || (mode === "square" && y < qrBottom)
      ? { x: sideX, w: sideW }
      : { x: pad, w: fullW };

  const lineGap = 1.15;
  const numSpace = mode === "square" ? qr * 0.6 : (textBottom - startY) * 0.45;
  const maxNumPt = numSpace / PT_MM / lineGap / 2;

  let y = startY;
  const put = (text: string, pt: number) => {
    const next = y + pt * PT_MM * (y === startY ? 1 : lineGap);
    if (next > textBottom) return false;
    doc.text(text, area(next).x, next);
    y = next;
    return true;
  };

  doc.setFont("Roboto", "bold");
  const parts = d.number.split("/");
  const head = parts.slice(0, 2).join("/");
  const tail = parts.slice(2).join("/");
  const p1 = fit(doc, head, area(y + maxNumPt * PT_MM).w, maxNumPt);
  put(head, p1);
  let p2 = p1;
  if (tail) {
    p2 = fit(doc, tail, area(y + p1 * PT_MM * lineGap).w, p1);
    put(tail, p2);
  }

  doc.setFont("Roboto", "normal");
  const infoPt = Math.max(5, p2 * 0.55);
  y += infoPt * PT_MM * 0.25;
  const lines = [d.date, `${d.qty} шт.`, d.counterparty || ""].filter(Boolean);
  const clip = (text: string, maxW: number) => {
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  };
  for (const line of lines) {
    const aw = area(y + infoPt * PT_MM * lineGap).w;
    const pt = fit(doc, line, aw, infoPt);
    if (pt >= infoPt * 0.8 && doc.getTextWidth(line) <= aw) {
      if (!put(line, pt)) break;
      continue;
    }
    const wrapPt = Math.max(5, infoPt * 0.85);
    doc.setFontSize(wrapPt);
    const words = line.split(/\s+/);
    const rows: string[] = [];
    let cur = "";
    for (const wd of words) {
      const nextW = area(y + wrapPt * PT_MM * lineGap * (rows.length + 1)).w;
      const cand = cur ? `${cur} ${wd}` : wd;
      if (doc.getTextWidth(cand) <= nextW || !cur) cur = cand;
      else {
        rows.push(cur);
        cur = wd;
      }
    }
    if (cur) rows.push(cur);
    const shown = rows.slice(0, 2);
    if (rows.length > 2) shown[1] = `${shown[1]} ${rows.slice(2).join(" ")}`;
    let ok = true;
    for (const r of shown) {
      doc.setFontSize(wrapPt);
      const t = clip(r, area(y + wrapPt * PT_MM * lineGap).w);
      if (!put(t, wrapPt)) {
        ok = false;
        break;
      }
    }
    if (!ok) break;
  }

  doc.addImage(barcode(d.code), "PNG", bx, bcTop, bcW, bcH);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(bcTextPt);
  doc.text(d.code, bx + bcW / 2, bottom, { align: "center" });
  return doc;
};
