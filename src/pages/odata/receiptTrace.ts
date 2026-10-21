import { gtdKind } from "./gtdFix";
import { OdataRow } from "./parseOdataFile";

export interface Country1C {
  key: string;
  code: string;
  name: string;
}

export interface CardTrace {
  country_key: string;
  traceable: boolean;
}

export const normCountry = (s: string) =>
  String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я]/g, "");

const OKSM_LIST: [string, string[]][] = [
  ["643", ["россия", "рф", "российскаяфедерация"]],
  ["112", ["беларусь", "белоруссия", "республикабеларусь"]],
  ["156", ["китай", "кнр", "китайскаянароднаяреспублика"]],
  ["792", ["турция", "турецкаяреспублика"]],
  ["276", ["германия", "фрг"]],
  ["380", ["италия"]],
  ["616", ["польша"]],
  ["410", ["корея", "кореяреспублика", "республикакорея", "южнаякорея"]],
  ["392", ["япония"]],
  ["704", ["вьетнам", "вьетнамсоциалистическаяреспублика"]],
  ["764", ["таиланд", "тайланд"]],
  ["458", ["малайзия"]],
  ["360", ["индонезия"]],
  ["356", ["индия"]],
  ["398", ["казахстан"]],
  ["860", ["узбекистан"]],
  ["417", ["киргизия", "кыргызстан", "киргизскаяреспублика"]],
  ["051", ["армения"]],
  ["031", ["азербайджан"]],
  ["268", ["грузия"]],
  ["498", ["молдова", "молдавия", "республикамолдова"]],
  ["804", ["украина"]],
  ["762", ["таджикистан"]],
  ["795", ["туркменистан", "туркмения"]],
  ["496", ["монголия"]],
  ["250", ["франция"]],
  ["724", ["испания"]],
  ["620", ["португалия"]],
  ["826", ["великобритания", "соединенноекоролевство", "англия"]],
  ["840", ["сша", "соединенныештаты", "соединенныештатыамерики"]],
  ["203", ["чехия", "чешскаяреспублика"]],
  ["703", ["словакия"]],
  ["705", ["словения"]],
  ["348", ["венгрия"]],
  ["642", ["румыния"]],
  ["100", ["болгария"]],
  ["688", ["сербия"]],
  ["191", ["хорватия"]],
  ["040", ["австрия"]],
  ["756", ["швейцария"]],
  ["752", ["швеция"]],
  ["246", ["финляндия"]],
  ["578", ["норвегия"]],
  ["208", ["дания"]],
  ["528", ["нидерланды", "голландия"]],
  ["056", ["бельгия"]],
  ["440", ["литва"]],
  ["428", ["латвия"]],
  ["233", ["эстония"]],
  ["300", ["греция"]],
  ["372", ["ирландия"]],
  ["376", ["израиль"]],
  ["818", ["египет"]],
  ["784", ["оаэ", "объединенныеарабскиеэмираты"]],
  ["158", ["тайвань", "тайванькитай"]],
  ["344", ["гонконг", "гонконгкитай"]],
  ["702", ["сингапур"]],
  ["608", ["филиппины"]],
  ["050", ["бангладеш"]],
  ["586", ["пакистан"]],
  ["364", ["иран"]],
  ["144", ["шриланка"]],
  ["116", ["камбоджа"]],
  ["484", ["мексика"]],
  ["076", ["бразилия"]],
  ["124", ["канада"]],
  ["036", ["австралия"]],
];

const OKSM: Record<string, string> = Object.fromEntries(
  OKSM_LIST.flatMap(([code, names]) => names.map((n) => [n, code])),
);

export const countryCode = (name: string) => OKSM[normCountry(name)] || "";

export const findCountry = (name: string, countries: Country1C[]) => {
  const n = normCountry(name);
  if (!n) return undefined;
  const code = OKSM[n];
  return countries.find((c) => normCountry(c.name) === n) || (code ? countries.find((c) => c.code === code) : undefined);
};

export interface TraceDiff {
  key: string;
  name: string;
  article: string;
  fromCountry: string;
  toCountry: string;
  toCountryKey: string;
  countryDiff: boolean;
  fromTrace: boolean;
  toTrace?: boolean;
}

export interface TracePlan {
  diffs: TraceDiff[];
  conflicts: { key: string; name: string; article: string; reason: string }[];
  create: { name: string; code: string }[];
  noCode: string[];
  keyByName: Record<string, string>;
  checked: number;
}

export const buildPlan = (
  rows: OdataRow[],
  keys: (string | null | undefined)[],
  cards: Record<string, CardTrace>,
  countries: Country1C[],
): TracePlan => {
  const byKey = new Map<string, { rows: OdataRow[] }>();
  rows.forEach((r, i) => {
    const k = keys[i];
    if (!k || !String(r.country || "").trim()) return;
    const e = byKey.get(k) || { rows: [] };
    e.rows.push(r);
    byKey.set(k, e);
  });

  const keyByName: Record<string, string> = {};
  const create = new Map<string, { name: string; code: string }>();
  const noCode = new Set<string>();
  const resolve = (name: string) => {
    const n = normCountry(name);
    if (keyByName[n]) return keyByName[n];
    const c = findCountry(name, countries);
    if (c) {
      keyByName[n] = c.key;
      return c.key;
    }
    const code = countryCode(name);
    if (code) {
      if (![...create.values()].some((x) => x.code === code)) create.set(n, { name: name.trim(), code });
    } else noCode.add(name.trim());
    return "";
  };
  const cname = (k: string) => countries.find((c) => c.key === k)?.name || (k ? "?" : "");

  const plan: TracePlan = { diffs: [], conflicts: [], create: [], noCode: [], keyByName, checked: 0 };
  byKey.forEach((e, key) => {
    const card = cards[key];
    const first = e.rows[0];
    if (!card) return;
    plan.checked += 1;
    const names = new Set(e.rows.map((r) => normCountry(r.country)));
    const kinds = new Set(
      e.rows
        .map((r) => {
          const n = String(r.rnpt || r.gtd || "").trim();
          return n ? gtdKind(n) : null;
        })
        .filter(Boolean),
    );
    if (names.size > 1 || kinds.size > 1) {
      plan.conflicts.push({
        key,
        name: first.name,
        article: first.article,
        reason: names.size > 1 ? "разные страны в УПД" : "и РНПТ, и ГТД в УПД",
      });
      return;
    }
    const ck = resolve(first.country);
    const kind = [...kinds][0];
    const toTrace = kind === "rnpt" ? true : kind === "td" ? false : undefined;
    const countryDiff = ck ? ck !== card.country_key : true;
    const traceDiff = toTrace !== undefined && toTrace !== card.traceable;
    if (!countryDiff && !traceDiff) return;
    plan.diffs.push({
      key,
      name: first.name,
      article: first.article,
      fromCountry: cname(card.country_key),
      toCountry: ck ? cname(ck) : first.country.trim(),
      toCountryKey: ck,
      countryDiff,
      fromTrace: card.traceable,
      toTrace: traceDiff ? toTrace : undefined,
    });
  });
  plan.create = [...create.values()];
  plan.noCode = [...noCode];
  return plan;
};

export interface TraceReport {
  countryChanged: { name: string; from: string; to: string }[];
  traceChanged: { name: string; from: boolean; to: boolean }[];
  created: { name: string; code: string }[];
  failed: { name: string; reason: string }[];
}
