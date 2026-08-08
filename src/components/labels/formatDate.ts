export const todayIso = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

export const formatDate = (iso?: string): string => {
  const src = iso || todayIso();
  const parts = src.split("-");
  if (parts.length !== 3) return src;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
};
