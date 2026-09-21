import { OdataRow } from "./parseOdataFile";

export const gtdKind = (n: string): "td" | "rnpt" | null => {
  const parts = String(n || "")
    .trim()
    .split("/")
    .filter((p) => p !== "");
  if (parts.length === 3) return "td";
  if (parts.length === 4) return "rnpt";
  return null;
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
    if (!raw || gtdKind(raw)) return;

    const a = String(r.article || "").trim().toLowerCase();
    const siblings = (byArticle.get(a) || []).filter(
      (s) => s !== r && gtdKind(String(s.gtd || s.rnpt || "")),
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
      conflict: numbers.length > 1,
    });
  });
  return out;
};

export interface GtdFix {
  country: string;
  number: string;
}

export const applyFixes = (
  rows: OdataRow[],
  fixes: Record<number, GtdFix>,
): OdataRow[] =>
  rows.map((r, i) => {
    const f = fixes[i];
    if (!f) return r;
    const kind = gtdKind(f.number);
    return {
      ...r,
      country: f.country,
      gtd: kind === "td" ? f.number : "",
      rnpt: kind === "rnpt" ? f.number : "",
    };
  });
