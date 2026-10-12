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
}

const Field = ({ label, children, bad }: { label: string; children: React.ReactNode; bad?: boolean }) => (
  <label className="block space-y-1">
    <span className={`text-xs ${bad ? "text-rose-400" : "text-muted-foreground"}`}>{label}</span>
    {children}
  </label>
);

const NomenNewItemRow = ({ item, groups, tnved, countries, onChange, site, lookup }: Props) => {
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
    <div className="p-3 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground w-7 shrink-0 pt-2">{item.idx + 1}</span>
        <div className="flex-1 min-w-0">
          <Field label="Наименование" bad={bad("наименование")}>
            <Input value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
        </div>
        <span
          className={`text-xs rounded-md px-2 py-1 shrink-0 mt-6 flex items-center gap-1 ${
            problems.length ? "text-amber-400 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10"
          }`}
        >
          <Icon name={problems.length ? "CircleAlert" : "CircleCheck"} size={13} />
          {problems.length ? `не хватает: ${problems.length}` : "готово"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 ml-9">
        <Field label="Артикул (необязательно)">
          <Input value={item.article} onChange={(e) => onChange({ article: e.target.value })} />
        </Field>
        <Field label="Штрихкод (необязательно)">
          <Input
            value={item.barcode}
            inputMode="numeric"
            onChange={(e) => onChange({ barcode: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Группа" bad={bad("группа")}>
          <Select value={item.groupKey} onValueChange={(v) => onChange({ groupKey: v })}>
            <SelectTrigger>
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
            {item.weightSrc === "site" && item.weight.trim()
              ? "с сайта"
              : !tnved
              ? "подбираю вес…"
              : item.weightAuto
                ? `среднее по ${similar.length} похожим`
                : item.weight.trim()
                  ? "введено вручную"
                  : "похожих с весом нет"}
          </span>
        </Field>
        <Field label="Код ТНВЭД" bad={bad("ТНВЭД")}>
          {options.length > 0 ? (
            <Select
              value={known ? item.tnved : "__custom"}
              onValueChange={(v) =>
                v === "__custom"
                  ? onChange({ tnved: "", tnvedKey: "" })
                  : onChange({ tnved: v, tnvedKey: options.find((o) => o.code === v)?.key || "" })
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
              className={options.length ? "mt-1.5" : ""}
              value={item.tnved}
              inputMode="numeric"
              maxLength={10}
              placeholder="10 цифр"
              onChange={(e) => onChange({ tnved: e.target.value.replace(/\D/g, ""), tnvedKey: "" })}
            />
          )}
        </Field>
        {tnved?.country && (
          <NomenCountryField
            value={item.countryKey}
            info={tnved.country}
            countries={countries}
            onChange={(k) => onChange({ countryKey: k, countryTouched: true })}
          />
        )}
      </div>

      {item.siteUrl && (
        <a
          href={item.siteUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-9 text-xs text-primary inline-flex items-center gap-1"
        >
          <Icon name="ExternalLink" size={13} />
          открыть на сайте
        </a>
      )}

      <div className="ml-9 text-xs text-muted-foreground">
        Тип «{item.kind}»:{" "}
        {tnved
          ? tnved.similar
            ? `похожих в 1С ${tnved.similar}, с кодом ТНВЭД ${options.reduce((s, o) => s + o.count, 0)}`
            : "похожих в 1С нет — код ТНВЭД введите вручную"
          : "подбираю ТНВЭД…"}
      </div>

      {similar.length > 0 && (
        <div className="ml-9 text-xs">
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