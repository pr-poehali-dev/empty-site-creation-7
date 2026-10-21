import { OdataRow } from "./parseOdataFile";

export const isNumberFormat = (n: string) => {
  const parts = String(n || "")
    .trim()
    .split("/")
    .filter((p) => p !== "");
  return parts.length === 3 || parts.length === 4;
};

export const isRussia = (c: string) =>
  /^(россия|рф|russia|ru)$/i.test(String(c || "").trim());

export interface ProblemRow {
  index: number;
  article: string;
  name: string;
  rawGtd: string;
  rawCountry: string;
  hintCountry: string;
  hintNumber: string;
  hintKind: "td" | "rnpt";
  conflict: boolean;
}

export const findProblemRows = (rows: OdataRow[]): ProblemRow[] => {
  const byArticle = new Map<string, OdataRow[]>();
  rows.forEach((r) => {
    const a = String(r.article || "").trim().toLowerCase();
    if (!a) return;
    const list = byArticle.get(a) || [];
    list.push(r);
    byArticle.set(a, list);
  });

  const out: ProblemRow[] = [];
  rows.forEach((r, index) => {
    const raw = String(r.gtd || r.rnpt || "").trim();
    if (!raw || isNumberFormat(raw)) return;

    const a = String(r.article || "").trim().toLowerCase();
    const siblings = (byArticle.get(a) || []).filter(
      (s) => s !== r && isNumberFormat(String(s.gtd || s.rnpt || "")),
    );
    const numbers = [
      ...new Set(siblings.map((s) => String(s.gtd || s.rnpt || "").trim())),
    ];
    const countries = [
      ...new Set(
        siblings.map((s) => String(s.country || "").trim()).filter(Boolean),
      ),
    ];

    out.push({
      index,
      article: r.article,
      name: r.name || "",
      rawGtd: raw,
      rawCountry: String(r.country || "").trim(),
      hintCountry: countries.length === 1 ? countries[0] : "",
      hintNumber: numbers.length === 1 ? numbers[0] : "",
      hintKind:
        numbers.length === 1 &&
        siblings.some((s) => String(s.rnpt || "").trim() === numbers[0])
          ? "rnpt"
          : r.rnpt
            ? "rnpt"
            : "td",
      conflict: numbers.length > 1,
    });
  });
  return out;
};

export interface GtdFix {
  country: string;
  number: string;
  kind: "td" | "rnpt";
}

export const applyFixes = (
  rows: OdataRow[],
  fixes: Record<number, GtdFix>,
): OdataRow[] =>
  rows.map((r, i) => {
    const f = fixes[i];
    if (!f) return r;
    return {
      ...r,
      country: f.country,
      gtd: f.kind === "td" ? f.number : "",
      rnpt: f.kind === "rnpt" ? f.number : "",
    };
  });

export const numberKinds = (rows: OdataRow[]) => {
  const out: Record<string, "td" | "rnpt"> = {};
  rows.forEach((r) => {
    const g = String(r.gtd || "").trim();
    if (g && !out[g]) out[g] = "td";
  });
  rows.forEach((r) => {
    const n = String(r.rnpt || "").trim();
    if (n) out[n] = "rnpt";
  });
  return out;
};
