import * as XLSX from "xlsx";
import func2url from "../../../backend/func2url.json";
import { Country1C, CreateResult, Decision, Group1C, NewItem, isTraceable, toNumber } from "./nomenApi";

const HEADERS = [
  "Код 1С (Трейд Ресурс)",
  "Наименование",
  "Полное наименование",
  "Артикул",
  "Штрихкод",
  "Группа",
  "Вид номенклатуры",
  "Единица",
  "Код ОКЕИ",
  "Ставка НДС",
  "Ставка НДС 2",
  "Способ списания",
  "Вес из сертификата, кг",
  "Код ТНВЭД",
  "Номенклатурная группа",
  "Базовая цена, ₽ (с НДС)",
  "Страна происхождения",
  "Прослеживаемый товар",
];

export interface ExcelRow {
  code: string;
  item: NewItem;
  barcodeWritten: boolean;
  countryFailed: boolean;
}

export const rowsForExcel = (
  items: NewItem[],
  results: Record<number, CreateResult>,
  decisions: Record<number, Decision>,
): ExcelRow[] =>
  items
    .map((item) => {
      const r = results[item.idx];
      const d = decisions[item.idx];
      const made = r?.state === "created" ? r : d?.kind === "create" && d.result.state === "created" ? d.result : null;
      return made ? { code: made.code || "", item, barcodeWritten: made.barcode === "added", countryFailed: made.country === "error" } : null;
    })
    .filter((x): x is ExcelRow => !!x);

export const buildNomenExcel = (rows: ExcelRow[], groups: Group1C[], countries: Country1C[] = []) => {
  const countryName = (k: string) => countries.find((c) => c.key === k)?.name || "";
  const groupName = (k: string) => groups.find((g) => g.key === k)?.path || "";
  const data = rows.map(({ code, item, countryFailed }) => [
    code,
    item.name.replace(/\s+/g, " ").trim().slice(0, 100),
    item.name.replace(/\s+/g, " ").trim(),
    item.article,
    item.barcode,
    groupName(item.groupKey),
    "Товары",
    "шт",
    "796",
    "22%",
    "Без НДС",
    "FIFO",
    toNumber(item.weight),
    item.tnved,
    "Основная номенклатурная группа",
    toNumber(item.price),
    countryFailed ? `${countryName(item.countryKey)} (не записана)` : countryName(item.countryKey),
    item.countryKey && !countryFailed ? (isTraceable(item.countryKey, countries) ? "Да" : "Нет") : "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...data]);
  ws["!cols"] = [12, 50, 60, 14, 16, 22, 12, 8, 9, 10, 12, 14, 12, 13, 28, 14, 18, 12].map((wch) => ({ wch }));
  data.forEach((_, i) => {
    for (const c of [4, 8, 13]) {
      const ref = XLSX.utils.encode_cell({ r: i + 1, c });
      if (ws[ref]) ws[ref].t = "s";
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Новая номенклатура");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
};

export const nomenFileName = (invoiceName: string) => {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const src = invoiceName.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40);
  return `Номенклатура_${src || "счёт"}_${stamp}.xlsx`;
};

export const downloadBase64 = (b64: string, fileName: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

export const saveToYuraFiles = async (b64: string, fileName: string, title: string, description: string) => {
  const r = await fetch((func2url as Record<string, string>)["converted-files"], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
    },
    body: JSON.stringify({ title, description, file_name: fileName, file: b64 }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Не удалось сохранить файл");
  return d as { id: number; file_url: string };
};
