import * as XLSX from "xlsx";
import { OdataRow, formatMoney } from "./parseOdataFile";

export interface MissingItem {
  article: string;
  barcode: string;
  name: string;
  quantity: number;
  price: number;
  country: string;
  numbers: string;
}

const uniqJoin = (list: string[]) => [...new Set(list.map((x) => x.trim()).filter(Boolean))].join(", ");

export const collectMissing = (rows: OdataRow[], found: (boolean | undefined)[]): MissingItem[] => {
  const map = new Map<string, { rows: OdataRow[] }>();
  rows.forEach((r, i) => {
    if (found[i] !== false) return;
    const k = (r.article.trim() || r.name.trim()).toLowerCase();
    const e = map.get(k) || { rows: [] };
    e.rows.push(r);
    map.set(k, e);
  });
  return [...map.values()].map(({ rows: list }) => ({
    article: list[0].article,
    barcode: list.find((x) => x.barcode)?.barcode || "",
    name: list[0].name,
    quantity: list.reduce((s, x) => s + (x.quantity || 0), 0),
    price: list[0].price,
    country: uniqJoin(list.map((x) => x.country)),
    numbers: uniqJoin(list.flatMap((x) => [x.gtd, x.rnpt])),
  }));
};

interface Meta {
  docNumber: string;
  docDate: string;
  fileName: string;
  total: number;
  withTrace: boolean;
}

const title = (m: Meta) =>
  ["Товары, не найденные в 1С", m.docNumber ? `документ поставщика № ${m.docNumber}` : "", m.docDate ? `от ${m.docDate}` : ""]
    .filter(Boolean)
    .join(" · ");

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").trim();

export const downloadMissing = (items: MissingItem[], m: Meta) => {
  const head = ["№", "Артикул", "Штрихкод", "Наименование", "Количество", "Цена", ...(m.withTrace ? ["Страна", "ГТД / РНПТ"] : [])];
  const data = items.map((x, i) => [
    i + 1,
    x.article,
    x.barcode,
    x.name,
    x.quantity,
    x.price,
    ...(m.withTrace ? [x.country, x.numbers] : []),
  ]);
  const aoa = [
    [title(m)],
    [`Файл: ${m.fileName}`],
    [`Не найдено: ${items.length} из ${m.total} позиций`],
    [],
    head,
    ...data,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 5 }, { wch: 18 }, { wch: 16 }, { wch: 60 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, { wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Нет в 1С");
  const name = ["Нет в 1С", m.docNumber, m.docDate].filter(Boolean).map(safe).join(" — ");
  XLSX.writeFile(wb, `${name}.xlsx`);
};

export const missingText = (items: MissingItem[], m: Meta) =>
  [
    title(m),
    `Не найдено: ${items.length} из ${m.total}`,
    "",
    ...items.map((x, i) =>
      [
        `${i + 1}. ${x.article || "без артикула"} — ${x.name}`,
        x.barcode ? `ШК ${x.barcode}` : "",
        `${x.quantity} шт × ${formatMoney(x.price)}`,
        m.withTrace && x.country ? x.country : "",
        m.withTrace && x.numbers ? x.numbers : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ),
  ].join("\n");
