import * as XLSX from "xlsx";
import type { DeskItem, DeskSet } from "@/lib/priceDesk";

const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));

export const exportPricesExcel = (set: DeskSet, items: DeskItem[]) => {
  const today = new Date();
  const date = today.toLocaleDateString("ru-RU");
  const rows: (string | number | null)[][] = [
    [set.title],
    [
      `Курс: за 100 RUB — ${set.rate_by_per_100_rub ?? "—"} BYN`,
      "",
      `Процент от Базовой: ${set.percent_of_base ?? "—"}%`,
      "",
      `Дата: ${date}`,
    ],
    [],
    ["Наименование", "Артикул", "Количество", "Цена РФ (RUB)", "Цена РБ (BYN)"],
  ];
  items.forEach((it) => {
    rows.push([it.name, it.article || "", num(it.quantity), num(it.price_ru), num(it.price_by)]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 60 }, { wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Цены");
  const safe = set.title.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  XLSX.writeFile(wb, `Ценовой стол — ${safe} — ${date}.xlsx`);
};
