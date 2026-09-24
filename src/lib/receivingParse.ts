import * as XLSX from "xlsx";

export interface RecField {
  key: string;
  title: string;
  required?: boolean;
}

export const REC_FIELDS: RecField[] = [
  { key: "supplier_barcode", title: "Штрихкод поставщика", required: true },
  { key: "tech_name", title: "Техническое наименование", required: true },
  { key: "serial_number", title: "Серийный номер" },
  { key: "declared_defect", title: "Заявленный дефект" },
  { key: "brand", title: "Бренд" },
  { key: "model", title: "Модель" },
  { key: "product_group", title: "Товарная группа" },
  { key: "direction", title: "Направление" },
  { key: "order_number", title: "Номер заказ-наряда" },
  { key: "supplier_code", title: "Код товара" },
  { key: "weight_gross", title: "Вес брутто" },
  { key: "weight_net", title: "Вес нетто" },
  { key: "volume", title: "Объём" },
  { key: "price", title: "Цена" },
];

const NUM_KEYS = new Set(["weight_gross", "weight_net", "volume", "price"]);

const SYN: Record<string, string[]> = {
  supplier_barcode: ["barcode", "штрихкод", "штрих-код", "шк"],
  tech_name: ["новое наименование", "техническое наименование"],
  serial_number: ["сер.№", "сер. №", "серийный номер", "серийник", "s/n"],
  declared_defect: ["описание", "заявленный дефект", "дефект"],
  brand: ["бренд", "производитель"],
  model: ["модель"],
  product_group: ["товарная группа", "группа товаров"],
  direction: ["направление"],
  order_number: ["№ заказ-наряда", "заказ-наряд", "номер заказ-наряда"],
  supplier_code: ["код товара", "код"],
  weight_gross: ["брутто, кг", "брутто", "вес брутто"],
  weight_net: ["нетто, кг", "нетто", "вес нетто"],
  volume: ["объём, куб.м.", "объем, куб.м.", "объём", "объем"],
  price: ["цена"],
};

export const norm = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const nkey = (v: unknown) => norm(v).toLowerCase().replace(/:$/, "").trim();

const detectField = (title: string): string | null => {
  const t = nkey(title);
  if (!t) return null;
  for (const [field, list] of Object.entries(SYN)) {
    if (list.includes(t)) return field;
  }
  for (const [field, list] of Object.entries(SYN)) {
    for (const v of list) {
      if (v.length >= 5 && t.includes(v)) return field;
    }
  }
  return null;
};

export const cleanCode = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  const s = norm(v);
  if (/^\d+\.0+$/.test(s)) return s.split(".")[0];
  if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? String(Math.round(n)) : s;
  }
  return s;
};

export const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = norm(v).replace(/\s/g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export interface RecColumn {
  index: number;
  title: string;
  sample: string;
  field: string | null;
}

export interface RecParsed {
  headerIndex: number;
  signature: string;
  columns: RecColumn[];
  rows: unknown[][];
  sheetName: string;
}

const scoreHeader = (row: unknown[]): number => {
  let hits = 0;
  const seen = new Set<string>();
  row.forEach((c) => {
    const f = detectField(norm(c));
    if (f && !seen.has(f)) {
      seen.add(f);
      hits += 1;
    }
  });
  return seen.has("tech_name") || seen.has("supplier_barcode") ? hits : 0;
};

export const parseReceivingFile = async (file: File): Promise<RecParsed> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  let rows: unknown[][] = [];
  let sheetName = "";
  wb.SheetNames.forEach((name) => {
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
    });
    if (sheetRows.length > rows.length) {
      rows = sheetRows;
      sheetName = name;
    }
  });
  if (rows.length === 0) throw new Error("Файл пустой или не читается");
  let headerIndex = -1;
  let bestScore = 0;
  rows.slice(0, 60).forEach((row, i) => {
    const sc = scoreHeader(row || []);
    if (sc > bestScore) {
      bestScore = sc;
      headerIndex = i;
    }
  });
  if (headerIndex < 0) throw new Error("Не нашёл строку заголовка таблицы");

  const headerRow = (rows[headerIndex] || []).map((c) => norm(c));
  const firstData = rows[headerIndex + 1] || [];

  const usedFields = new Set<string>();
  const columns: RecColumn[] = [];
  headerRow.forEach((title, index) => {
    if (!title) return;
    let field = detectField(title);
    if (field && usedFields.has(field)) field = null;
    if (field) usedFields.add(field);
    columns.push({
      index,
      title,
      sample: norm(firstData[index]).slice(0, 60),
      field,
    });
  });

  return {
    headerIndex,
    signature: headerRow.filter(Boolean).map(nkey).join("|").slice(0, 500),
    columns,
    rows,
    sheetName,
  };
};

export type RecRow = Record<string, string | number | null>;

export const buildRows = (parsed: RecParsed, mapping: Record<string, number>): RecRow[] => {
  const out: RecRow[] = [];
  let blanks = 0;
  for (let i = parsed.headerIndex + 1; i < parsed.rows.length; i += 1) {
    const r = parsed.rows[i] || [];
    const joined = r.map((c) => norm(c)).filter(Boolean).join(" ");
    if (!joined) {
      blanks += 1;
      if (blanks >= 20) break;
      continue;
    }
    blanks = 0;

    const item: RecRow = {};
    REC_FIELDS.forEach(({ key }) => {
      const idx = mapping[key];
      if (idx === undefined || idx === null) {
        item[key] = null;
        return;
      }
      const raw = r[idx];
      if (NUM_KEYS.has(key)) {
        item[key] = toNum(raw);
      } else {
        const s = cleanCode(raw);
        item[key] = s && s.toUpperCase() !== "NULL" ? s : null;
      }
    });

    if (!item.supplier_barcode || !item.tech_name) continue;
    out.push(item);
  }
  return out;
};