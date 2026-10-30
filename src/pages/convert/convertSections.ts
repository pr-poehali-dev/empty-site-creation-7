export interface ConvertSection {
  title: string;
  icon: string;
  path: string;
}

export const CONVERT_MENU = "/admin/convert";

export const CONVERT_SECTIONS: ConvertSection[] = [
  { title: "Файлы от Юры", icon: "FolderOpen", path: "/admin/converted-files" },
  { title: "Из накладных 1С в каталог", icon: "PackageSearch", path: "/admin/convert/waybill-catalog" },
  { title: "Конвертация в XML", icon: "FileCode", path: "/admin/convert/xml" },
  { title: "Конвертация Таможня РФ", icon: "Landmark", path: "/admin/convert/customs-ru" },
  { title: "Конвертация Таможня РБ", icon: "Landmark", path: "/admin/convert/customs-by" },
];
