export interface OdataBase {
  slug: string;
  title: string;
  hint: string;
  ready: boolean;
  kind?: "trade" | "unf";
}

export const ODATA_BASES: OdataBase[] = [
  {
    slug: "trade-resurs",
    title: "ООО Трейд Ресурс",
    hint: "Управление нашей фирмой",
    ready: true,
  },
  {
    slug: "fomkin",
    title: "ИП Фомкин А.Л.",
    hint: "Управление нашей фирмой (УНФ)",
    ready: true,
    kind: "unf",
  },
  {
    slug: "mirtehniki",
    title: "МирТехники",
    hint: "Подключим позже",
    ready: false,
  },
];

export const findBase = (slug?: string) =>
  ODATA_BASES.find((b) => b.slug === slug);
