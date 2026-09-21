export interface OdataBase {
  slug: string;
  title: string;
  hint: string;
  ready: boolean;
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
    hint: "Подключим позже",
    ready: false,
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
