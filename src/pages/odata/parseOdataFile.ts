import * as XLSX from "xlsx";

export interface OdataRow {
  article: string;
  barcode: string;
  name: string;
  quantity: number;
  price: number;
  country: string;
  gtd: string;
  rnpt: string;
}

export interface ParsedFile {
  header: string;
  docNumber: string;
  docDate: string;
  rows: OdataRow[];
  total: number;
}

const txt = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.endsWith(".0") ? s.slice(0, -2) : s;
};

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

export const parseOdataFile = (data: ArrayBuffer): ParsedFile => {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });

  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const cells = (grid[i] || []).map((c) => txt(c).toLowerCase());
    if (cells.includes("артикул") && cells.includes("наименование")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) {
    throw new Error(
      "Не нашёл шапку таблицы. Нужен файл, собранный по правилу «Создание файла для OData»",
    );
  }

  const head = (grid[headerRow] || []).map((c) => txt(c).toLowerCase());
  const at = (name: string) => head.indexOf(name);

  const idx = {
    article: at("артикул"),
    barcode: at("штрихкод"),
    name: at("наименование"),
    quantity: at("количество"),
    price: at("цена"),
    country: at("страна"),
    gtd: at("номер гтд"),
    rnpt: at("номер рнпт"),
  };

  const title = headerRow > 0 ? txt(grid[0]?.[0]) : "";
  const numMatch = title.match(/№\s*([^\s,]+)/);
  const dateMatch = title.match(/(\d{2}[.,]\d{2}[.,]\d{2,4})/);

  const rows: OdataRow[] = [];
  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const article = txt(r[idx.article]);
    const name = txt(r[idx.name]);
    if (!article && !name) continue;
    rows.push({
      article,
      barcode: idx.barcode >= 0 ? txt(r[idx.barcode]) : "",
      name,
      quantity: num(r[idx.quantity]),
      price: num(r[idx.price]),
      country: idx.country >= 0 ? txt(r[idx.country]) : "",
      gtd: idx.gtd >= 0 ? txt(r[idx.gtd]) : "",
      rnpt: idx.rnpt >= 0 ? txt(r[idx.rnpt]) : "",
    });
  }

  const total = rows.reduce((s, r) => s + r.quantity * r.price, 0);

  return {
    header: title,
    docNumber: numMatch ? numMatch[1] : "",
    docDate: dateMatch ? dateMatch[1].replace(/,/g, ".") : "",
    rows,
    total: Math.round(total * 100) / 100,
  };
};

export const formatMoney = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
