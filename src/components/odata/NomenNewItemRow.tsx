import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import { useMemo, useState } from "react";
import NomenCountryField from "./NomenCountryField";
import NomenSiteField from "./NomenSiteField";
import NomenGroupCreate from "./NomenGroupCreate";
import NomenSearchBox from "./NomenSearchBox";
import AutoTextarea from "./AutoTextarea";
import {
  Country1C,
  Group1C,
  NewItem,
  SiteProduct,
  SiteSettings,
  TnvedKind,
  avgWeight,
  siteLabel,
  sitePrice,
  fmtWeight,
  newItemProblems,
  similarWeights,
} from "@/pages/odata/nomenApi";

interface Props {
  item: NewItem;
  groups: Group1C[];
  tnved?: TnvedKind;
  countries: Country1C[];
  onChange: (patch: Partial<NewItem>) => void;
  site: SiteSettings;
  lookup: (article: string) => Promise<SiteProduct>;
  base: string;
  onGroupAdded: (g: Group1C) => void;
}

const Field = ({ label, children, bad }: { label: string; children: React.ReactNode; bad?: boolean }) => (
  <label className="block space-y-1">
    <span className={`text-xs ${bad ? "text-rose-400" : "text-muted-foreground"}`}>{label}</span>
    {children}
  </label>
);

const T = "text-sm md:text-sm";

const NomenNewItemRow = ({ item, groups, tnved: auto, countries, onChange, site, lookup, base, onGroupAdded }: Props) => {
  const tnved: TnvedKind | undefined = item.found
    ? { ...item.found, country: auto?.country ? item.found.country : undefined }
    : auto;
  const problems = newItemProblems(item);
  const bad = (k: string) => problems.includes(k);
  const options = tnved?.options || [];
  const known = options.some((o) => o.code === item.tnved);
  const [open, setOpen] = useState(false);
  const similar = useMemo(() => similarWeights(item.name, tnved?.weights), [item.name, tnved]);
  const avg = avgWeight(similar);
  const siteName = siteLabel(site.site);
  const doLookup = site.site ? () => lookup(item.article) : null;
  const priceMissing = site.site === "weissgauff" && site.wgPrice === "old" ? "нет зачёркнутой цены" : "на сайте нет цены";

  return (
    <div className={`p-3 space-y-3 ${item.skip ? "opacity-50" : ""}`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex-1 min-w-0 truncate ${!item.skip && bad("наименование") ? "text-rose-400" : "text-muted-foreground"}`}>
            {item.idx + 1} · Наименование
          </span>
          {!item.skip && (
            <span
              className={`shrink-0 whitespace-nowrap flex items-center gap-1 ${
                problems.length ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              <Icon name={problems.length ? "CircleAlert" : "CircleCheck"} size={12} />
              {problems.length ? `не хватает: ${problems.length}` : "готово"}
            </span>
          )}
          <button
            type="button"
            onClick={() => onChange({ skip: !item.skip })}
            aria-pressed={!!item.skip}
            className={`shrink-0 whitespace-nowrap flex items-center gap-1 rounded-md border px-2 py-1 ${
              item.skip
                ? "border-rose-400/60 bg-rose-500/15 text-rose-300"
                : "border-white/[0.1] text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name={item.skip ? "Undo2" : "Ban"} size={12} />
            {item.skip ? "Вернуть" : "Не загружать"}
          </button>
        </div>
        <AutoTextarea value={item.name} onChange={(v) => onChange({ name: v })} />
        {item.category && <div className="text-xs text-muted-foreground truncate">Категория: {item.category}</div>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="Артикул (необязательно)">
          <Input className={T} value={item.article} onChange={(e) => onChange({ article: e.target.value })} />
        </Field>
        <Field label="Штрихкод (необязательно)">
          <Input
            className={T}
            value={item.barcode}
            inputMode="numeric"
            onChange={(e) => onChange({ barcode: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Группа" bad={bad("группа")}>
          <div className="flex gap-1.5">
            <Select value={item.groupKey} onValueChange={(v) => onChange({ groupKey: v })}>
              <SelectTrigger className="min-w-0">
                <SelectValue placeholder="Выбрать" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <NomenGroupCreate
              base={base}
              groups={groups}
              onCreated={(g) => {
                onGroupAdded(g);
                onChange({ groupKey: g.key });
              }}
            />
          </div>
        </Field>
        <Field label="Базовая цена, ₽" bad={bad("цена")}>
          <NomenSiteField
            value={item.price}
            inputMode="decimal"
            placeholder={item.invoicePrice ? `в счёте ${item.invoicePrice}` : "0"}
            unit="₽"
            siteName={siteName}
            lookup={doLookup}
            pick={(p) => sitePrice(p, site)}
            missing={priceMissing}
            onType={(v) => onChange({ price: v, priceSrc: "manual" })}
            onSite={(v, p) => onChange({ price: String(v), priceSrc: "site", siteUrl: p.url })}
          />
          {item.price.trim() && item.priceSrc && (
            <span className="block text-[11px] leading-tight text-muted-foreground">
              {item.priceSrc === "site" ? "с сайта" : "введено вручную"}
            </span>
          )}
        </Field>
        <Field label="Вес из сертификата, кг" bad={bad("вес")}>
          <NomenSiteField
            value={item.weight}
            inputMode="decimal"
            placeholder="например 12,5"
            unit="кг"
            siteName={siteName}
            lookup={doLookup}
            pick={(p) => p.weight ?? null}
            missing="на сайте нет веса"
            avg={similar.length ? { value: `${fmtWeight(avg)} кг`, hint: "" } : null}
            onAvg={() => onChange({ weight: fmtWeight(avg), weightAuto: true, weightSrc: undefined })}
            onType={(v) =>
              onChange({ weight: v.replace(/[^\d.,]/g, "").replace(".", ","), weightAuto: false, weightSrc: undefined })
            }
            onSite={(v, p) =>
              onChange({ weight: fmtWeight(v), weightAuto: false, weightSrc: "site", siteUrl: p.url })
            }
          />
          <span className="block text-[11px] leading-tight text-muted-foreground">
            {item.weightSrc === "file" && item.weight.trim()
              ? "из файла"
              : item.weightSrc === "site" && item.weight.trim()
              ? "с сайта"
              : !tnved
              ? "подбор по похожим не запускался"
              : item.weightAuto
                ? `среднее по ${similar.length} похожим`
                : item.weight.trim()
                  ? "введено вручную"
                  : "похожих с весом нет"}
          </span>
          {item.fileWeight && item.weight !== item.fileWeight && (
            <button
              type="button"
              className="block text-[11px] leading-tight text-primary underline underline-offset-2"
              onClick={() => onChange({ weight: item.fileWeight!, weightAuto: false, weightSrc: "file" })}
            >
              вернуть из файла ({item.fileWeight} кг)
            </button>
          )}
        </Field>
        <Field label="Код ТНВЭД" bad={bad("ТНВЭД")}>
          {options.length > 0 ? (
            <Select
              value={known ? item.tnved : "__custom"}
              onValueChange={(v) =>
                v === "__custom"
                  ? onChange({ tnved: "", tnvedKey: "", tnvedSrc: undefined })
                  : onChange({ tnved: v, tnvedKey: options.find((o) => o.code === v)?.key || "", tnvedSrc: undefined })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.key} value={o.code}>
                    {o.code} · у {o.count}
                  </SelectItem>
                ))}
                <SelectItem value="__custom">Ввести вручную</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {(!options.length || !known) && (
            <Input
              className={`${T} ${options.length ? "mt-1.5" : ""}`}
              value={item.tnved}
              inputMode="numeric"
              maxLength={10}
              placeholder="10 цифр"
              onChange={(e) => onChange({ tnved: e.target.value.replace(/\D/g, ""), tnvedKey: "", tnvedSrc: undefined })}
            />
          )}
          {item.tnved.trim() && (item.tnvedSrc === "file" || item.tnvedMissing) && (
            <span className={`block text-[11px] leading-tight ${item.tnvedMissing ? "text-amber-400" : "text-muted-foreground"}`}>
              {item.tnvedSrc === "file" ? "из файла" : ""}
              {item.tnvedSrc === "file" && item.tnvedMissing ? " · " : ""}
              {item.tnvedMissing ? "кода нет в 1С — создайте в блоке выше" : ""}
            </span>
          )}
          {item.fileTnved && item.tnved !== item.fileTnved && (
            <button
              type="button"
              className="block text-[11px] leading-tight text-primary underline underline-offset-2"
              onClick={() =>
                onChange({
                  tnved: item.fileTnved!,
                  tnvedKey: options.find((o) => o.code === item.fileTnved)?.key || "",
                  tnvedSrc: "file",
                })
              }
            >
              вернуть из файла ({item.fileTnved})
            </button>
          )}
        </Field>
        {tnved?.country && (
          <NomenCountryField
            value={item.countryKey}
            info={tnved.country}
            countries={countries}
            onChange={(k) => onChange({ countryKey: k, countryTouched: true, countrySrc: undefined })}
            siteName={siteName}
            lookup={doLookup}
            fromSite={item.countrySrc === "site"}
            fromFile={item.countrySrc === "file"}
            fileCountry={item.fileCountry}
            onSite={(k, p) => onChange({ countryKey: k, countryTouched: true, countrySrc: "site", siteUrl: p.url })}
          />
        )}
      </div>

      {item.siteUrl && (
        <a
          href={item.siteUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary inline-flex items-center gap-1"
        >
          <Icon name="ExternalLink" size={13} />
          открыть на сайте
        </a>
      )}

      <NomenSearchBox
        base={base}
        value={item.search ?? ""}
        found={item.found}
        onValue={(v) => onChange({ search: v })}
        onFound={(r) => {
          const best = r.options[0];
          const avgW = avgWeight(similarWeights(item.name, r.weights));
          const manual = item.weight.trim() && !item.weightAuto;
          const patch: Partial<NewItem> = { found: r };
          if (best && item.tnvedSrc !== "file") Object.assign(patch, { tnved: best.code, tnvedKey: best.key });
          if (!manual && item.weightSrc !== "file") Object.assign(patch, avgW > 0 ? { weight: fmtWeight(avgW), weightAuto: true, weightSrc: undefined } : {});
          if (auto?.country && !item.countryTouched) patch.countryKey = r.country?.options?.[0]?.key || "";
          onChange(patch);
        }}
        onPick={(f) => {
          const patch: Partial<NewItem> = {};
          if (f.tnved) Object.assign(patch, { tnved: f.tnved, tnvedKey: f.tnved_key, tnvedSrc: undefined });
          if (f.w) Object.assign(patch, { weight: fmtWeight(f.w), weightAuto: false, weightSrc: undefined });
          onChange(patch);
        }}
      />

      <div className="text-xs text-muted-foreground">
        {item.found ? (
          `Искал по «${item.found.query}»: найдено в 1С ${item.found.similar}, с кодом ТНВЭД ${options.reduce((s, o) => s + o.count, 0)}`
        ) : !item.kind ? "Тип товара не определён — вес и код ТНВЭД введите вручную" : <>
        Тип «{item.kind}»:{" "}
        {tnved
          ? tnved.similar
            ? `похожих в 1С ${tnved.similar}${tnved.basis && tnved.basis !== item.kind ? ` (искал по «${tnved.basis}»)` : ""}, с кодом ТНВЭД ${options.reduce((s, o) => s + o.count, 0)}`
            : "похожих в 1С нет — код ТНВЭД введите вручную"
          : "подбор по похожим не запускался"}
        </>}
        {item.found && (
          <button type="button" className="ml-2 underline underline-offset-2" onClick={() => {
              const best = auto?.options?.[0];
              const avgW = avgWeight(similarWeights(item.name, auto?.weights));
              const manual = item.weight.trim() && !item.weightAuto;
              onChange({
                found: undefined,
                tnved: best?.code || "",
                tnvedKey: best?.key || "",
                ...(manual ? {} : { weight: avgW > 0 ? fmtWeight(avgW) : "", weightAuto: avgW > 0 }),
                ...(auto?.country && !item.countryTouched ? { countryKey: auto.country.options?.[0]?.key || "" } : {}),
              });
            }}>
            вернуть автоподбор
          </button>
        )}
      </div>

      {similar.length > 0 && (
        <div className="text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              className="text-primary flex items-center gap-1"
              onClick={() => setOpen((v) => !v)}
            >
              <Icon name={open ? "ChevronUp" : "ChevronDown"} size={13} />
              Вес: среднее по {similar.length} похожим — {fmtWeight(avg)} кг
            </button>
            {!item.weightAuto && (
              <button
                type="button"
                className="text-muted-foreground underline underline-offset-2"
                onClick={() => onChange({ weight: fmtWeight(avg), weightAuto: true })}
              >
                подставить среднее
              </button>
            )}
          </div>
          {open && (
            <div className="mt-1.5 rounded-lg border border-white/[0.08] divide-y divide-white/[0.06]">
              {similar.map((c) => (
                <div key={c.code + c.name} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="flex-1 min-w-0 truncate text-muted-foreground">{c.name}</span>
                  <span className="shrink-0 tabular-nums">{fmtWeight(c.w)} кг</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NomenNewItemRow;