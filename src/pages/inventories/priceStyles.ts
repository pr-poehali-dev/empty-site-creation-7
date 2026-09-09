export const LEGACY_DATE = "25.08.26";

/** Цвет рамки карточки товара по источнику цены. Ноль обрабатывается отдельно. */
export const priceBorder = (line: {
  price: number;
  price_is_manual?: boolean;
  price_source?: string | null;
}) => {
  if (!line.price) return "";
  if (line.price_is_manual || line.price_source === "manual") return "border-2 border-yellow-500/60";
  if (line.price_source === "rule") return "border-2 border-blue-500/60";
  if (line.price_source === "card") return "border-2 border-green-500/60";
  return "";
};

/** Подпись под ценой: дата, id автора (владельцу) и буква источника. */
export const priceNote = (
  line: {
    price: number;
    price_is_manual?: boolean;
    price_source?: string | null;
    price_date?: string | null;
    price_changed_by?: string | null;
  },
  isOwner: boolean
) => {
  const who0 = isOwner && line.price_changed_by ? `id=${line.price_changed_by}` : "";
  if (!line.price) return who0;
  const manual = line.price_is_manual || line.price_source === "manual";
  const src = manual ? "manual" : line.price_source;
  const letter = src === "manual" ? "Р" : src === "rule" ? "П" : src === "card" ? "К" : "";
  const word = src === "rule" ? "база" : "цена";
  const date = line.price_date
    ? `${word} от ${line.price_date}`
    : letter
      ? `${word} до ${LEGACY_DATE}`
      : "";
  const who = isOwner && line.price_changed_by ? `id=${line.price_changed_by}` : "";
  return [date, who, letter].filter(Boolean).join(" ");
};
