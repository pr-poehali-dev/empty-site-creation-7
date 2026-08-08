const USED_RE =
  /(^|[^A-Za-zА-Яа-яЁё0-9])[\s,;.\-–—]*[([{]?\s*[б6B]\s*[/\\.,]?\s*[уyУY]\s*\.?\s*[)\]}]?\s*\.?\s*$/i;

export const stripUsedSuffix = (name: string): string => {
  if (!name) return "";
  const cleaned = name.replace(USED_RE, "").replace(/[\s,;\-–—]+$/, "");
  return cleaned.trim() || name.trim();
};
