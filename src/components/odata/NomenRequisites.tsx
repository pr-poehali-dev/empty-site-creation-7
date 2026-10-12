import {
  Country1C,
  CreateResult,
  Group1C,
  NewItem,
  TnvedKind,
  avgWeight,
  fmtWeight,
  isTraceable,
  newItemProblems,
  similarWeights,
  toNumber,
} from "@/pages/odata/nomenApi";

export const COMMON_REQUISITES =
  "Товары · шт (796) · НДС Общая 22% · Основная номенклатурная группа · полное наименование = наименование";

type Part = { text: string; tone?: "auto" | "bad" | "warn" | "ok"; title?: string };

const TONE: Record<string, string> = {
  auto: "text-muted-foreground/70",
  bad: "text-rose-400",
  warn: "text-amber-400",
  ok: "text-emerald-400",
};

const Line = ({ parts, className = "" }: { parts: Part[]; className?: string }) => (
  <div className={`text-[11px] leading-snug mt-1 ${className}`}>
    {parts.map((p, i) => (
      <span key={i}>
        {i > 0 && <span className="text-muted-foreground/50"> · </span>}
        <span title={p.title} className={p.tone ? TONE[p.tone] : "text-foreground/80"}>
          {p.text}
        </span>
      </span>
    ))}
  </div>
);

const money = (s: string) => `${toNumber(s).toLocaleString("ru-RU")} ₽`;

interface Props {
  item: NewItem;
  originalName: string;
  kind?: TnvedKind;
  groups: Group1C[];
  countries: Country1C[];
  made?: CreateResult | null;
  failed?: CreateResult | null;
  exists?: CreateResult | null;
  priceDoc?: string | null;
}

const countryPart = (item: NewItem, kind: TnvedKind | undefined, countries: Country1C[]): Part | null => {
  if (!kind?.country) return null;
  const c = countries.find((x) => x.key === item.countryKey);
  if (!c) return { text: "страна не указана", tone: "auto" };
  const n = kind.country.options.find((o) => o.key === c.key)?.count;
  return {
    text: `${c.name}${item.countrySrc === "site" ? " (сайт)" : ""}${isTraceable(c.key, countries) ? ", прослеж." : ""}`,
    tone: item.countryTouched && item.countrySrc !== "site" ? undefined : "auto",
    title: item.countrySrc === "site" ? `с сайта ${item.siteUrl || ""}` : item.countryTouched ? "выбрано вручную" : `подобрано: у ${n ?? 0} похожих`,
  };
};

const NomenRequisites = ({ item, originalName, kind, groups, countries, made, failed, exists, priceDoc }: Props) => {
  if (exists?.card) {
    return <Line parts={[{ text: `Уже есть: ${exists.card.code} — ${exists.card.name}`, tone: "warn" }]} />;
  }

  if (made) {
    const country = countryPart(item, kind, countries);
    const parts: Part[] = [
      { text: `Создана ${made.code}`, tone: "ok" },
      { text: "группа, вес, ТНВЭД ✓", tone: "ok" },
    ];
    if (made.country === "set" && country) parts.push({ text: `${country.text} ✓`, tone: "ok" });
    if (made.country === "error")
      parts.push({ text: "страна не записана — вручную", tone: "warn", title: made.country_error });
    if (made.country === "none" && kind?.country) parts.push({ text: "страна не указана", tone: "auto" });
    if (made.barcode === "added") parts.push({ text: "ШК ✓", tone: "ok" });
    else if (made.barcode === "taken")
      parts.push({
        text: `ШК занят: ${made.barcode_owner?.code}`,
        tone: "warn",
        title: made.barcode_owner?.name,
      });
    else if (made.barcode === "error") parts.push({ text: "ШК не записан", tone: "warn", title: made.barcode_error });
    else parts.push({ text: "ШК нет", tone: "auto" });
    parts.push(
      priceDoc
        ? { text: "цена ✓", tone: "ok", title: `документ установки цен ${priceDoc}` }
        : { text: "цена — ждёт документа", tone: "auto" },
    );
    return <Line parts={parts} />;
  }

  const problems = newItemProblems(item);
  const has = (k: string) => !problems.includes(k);
  const group = groups.find((g) => g.key === item.groupKey);
  const similar = similarWeights(item.name, kind?.weights);
  const avg = avgWeight(similar);
  const tOpt = kind?.options.find((o) => o.code === item.tnved);
  const nameFixed = item.name.trim() !== originalName.trim();

  const parts: Part[] = [];
  if (nameFixed) parts.push({ text: "наим. исправлено", title: `в счёте: ${originalName}` });
  parts.push(has("группа") ? { text: group?.path || "группа" } : { text: "группа?", tone: "bad" });
  parts.push(
    has("цена")
      ? {
          text: item.priceSrc === "site" ? `${money(item.price)} (сайт)` : money(item.price),
          tone: item.priceSrc === "site" ? "auto" : undefined,
          title: item.priceSrc === "site" ? `с сайта ${item.siteUrl || ""}` : "введено вручную",
        }
      : { text: "цена?", tone: "bad" },
  );
  parts.push(
    has("вес")
      ? {
          text: item.weightSrc === "site" ? `${item.weight} кг (сайт)` : `${item.weight} кг`,
          tone: item.weightAuto || item.weightSrc === "site" ? "auto" : undefined,
          title: item.weightSrc === "site" ? `с сайта ${item.siteUrl || ""}` : item.weightAuto ? `среднее по ${similar.length} похожим (${fmtWeight(avg)} кг)` : "введено вручную",
        }
      : { text: "вес?", tone: "bad" },
  );
  parts.push(
    has("ТНВЭД")
      ? {
          text: `ТНВЭД ${item.tnved}`,
          tone: tOpt ? "auto" : undefined,
          title: tOpt ? `у ${tOpt.count} похожих карточек` : "введено вручную",
        }
      : { text: "ТНВЭД?", tone: "bad" },
  );
  const country = countryPart(item, kind, countries);
  if (country) parts.push(country);
  parts.push(item.barcode.trim() ? { text: "ШК есть", title: item.barcode } : { text: "ШК нет", tone: "auto" });
  if (item.name.trim().length > 100)
    parts.push({
      text: "наим. > 100",
      tone: "warn",
      title: "В короткое наименование войдут первые 100 символов, полное сохранится целиком",
    });

  return (
    <>
      {failed?.error && <Line parts={[{ text: `Не создана: ${failed.error}`, tone: "bad" }]} />}
      <Line parts={parts} />
    </>
  );
};

export default NomenRequisites;
