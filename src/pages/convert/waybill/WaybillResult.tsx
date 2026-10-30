import { Fragment, ReactNode, useState } from "react";
import Icon from "@/components/ui/icon";
import { CatMatch, PRICE_RULES, PriceRule, Twin, WbBuild, WbItem, finalPrice, guessBrand, isMultiPrice } from "./api";
import { TwinList, twinsOf } from "./AutoArticles";
import { CardList, Marks } from "./CatalogSummary";

const ART_W = "w-[90px] min-w-[90px] max-w-[90px]";
const ART_TXT = "break-words [overflow-wrap:anywhere]";
const CAT_TH = "bg-emerald-500/10 text-emerald-300/90";
const CAT_TD = "bg-emerald-500/[0.06]";

const money = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

const Missing = ({ title, list }: { title: string; list: WbItem[] }) => {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="text-amber-400 flex items-center gap-1">
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} />
        {title}: {list.length}
      </button>
      {open && (
        <ul className="mt-1 ml-4 space-y-0.5 text-muted-foreground">
          {list.map((x) => (
            <li key={x.key}>
              {x.article ? `${x.article} · ` : ""}
              {x.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface Props {
  data: WbBuild;
  rule: PriceRule;
  picks: Record<string, number>;
  onRule: (r: PriceRule) => void;
  onPick: (key: string, price: number | null) => void;
  brands: Record<string, string>;
  onBrand: (key: string, brand: string) => void;
  twins: Record<string, Twin[]> | null;
  writtenKeys: Set<string>;
  articles: ReactNode;
  cat: Record<string, CatMatch> | null;
  catalog: ReactNode;
}

const BrandInput = ({ x, value, edited, onBrand }: { x: WbItem; value: string; edited: boolean; onBrand: (key: string, brand: string) => void }) => (
  <input
    value={value}
    onChange={(e) => onBrand(x.key, e.target.value)}
    placeholder="—"
    className={`w-32 rounded border bg-transparent px-1.5 py-0.5 text-xs outline-none focus:border-primary ${
      !value.trim()
        ? "border-rose-500/60 bg-rose-500/10"
        : edited
          ? "border-violet-500/50 text-violet-300"
          : "border-white/[0.08]"
    }`}
  />
);

const NoBrand = ({ list, brandOf, onBrand }: { list: WbItem[]; brandOf: (x: WbItem) => string; onBrand: (key: string, brand: string) => void }) => {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="text-amber-400 flex items-center gap-1">
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} />
        Бренд не определён: {list.length}
      </button>
      {open && (
        <ul className="mt-1 ml-4 space-y-1 text-muted-foreground">
          {list.map((x) => (
            <li key={x.key} className="flex items-center gap-2">
              <BrandInput x={x} value={brandOf(x)} edited={false} onBrand={onBrand} />
              <span>{x.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const WaybillResult = ({ data, rule, picks, onRule, onPick, brands, onBrand, twins, writtenKeys, articles, cat, catalog }: Props) => {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const showCat = !!cat;
  const cols = showCat ? 10 : 7;
  const [openRow, setOpenRow] = useState<string | null>(null);
  const brandOf = (x: WbItem) => (brands[x.key] !== undefined ? brands[x.key] : guessBrand(x.name, x.group));
  const [noBrandKeys] = useState(() => new Set(data.items.filter((x) => !guessBrand(x.name, x.group)).map((x) => x.key)));
  const [showDiff, setShowDiff] = useState(false);
  const [showMulti, setShowMulti] = useState(true);
  const items = data.items;
  const multi = items.filter(isMultiPrice);
  const diff = items.filter((x) => x.price_diff.length && !isMultiPrice(x));
  const priceOf = (x: WbItem) => finalPrice(x, rule, picks);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-md px-2 py-1 bg-emerald-500/10 text-emerald-400">Товаров: {items.length}</span>
        <span className="rounded-md px-2 py-1 bg-white/[0.06] text-muted-foreground">
          Строк в накладных: {data.lines}
        </span>
        {multi.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMulti(!showMulti)}
            className="rounded-md px-2 py-1 bg-amber-500/10 text-amber-400"
          >
            Несколько цен в накладной: {multi.length} · {showMulti ? "скрыть" : "показать"}
          </button>
        )}
        {diff.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDiff(!showDiff)}
            className="rounded-md px-2 py-1 bg-white/[0.06] text-muted-foreground"
          >
            Цены менялись между накладными: {diff.length} · {showDiff ? "скрыть" : "показать"}
          </button>
        )}
      </div>

      {multi.length > 0 && showMulti && (
        <div className="rounded-lg border border-amber-500/30 p-2 space-y-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              В последней накладной у товара несколько цен. Какую брать:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_RULES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => onRule(r.value)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    rule === r.value
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-white/[0.1] text-muted-foreground hover:bg-white/[0.04]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-white/[0.06] text-xs">
            {multi.map((x) => {
              const manual = picks[x.key] !== undefined;
              const price = priceOf(x);
              return (
                <div key={x.key} className="py-2 space-y-1">
                  <div className="text-foreground">{x.name}</div>
                  <div className="text-muted-foreground">{x.price_doc}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {x.variants.map((v) => (
                      <button
                        key={v.price}
                        type="button"
                        onClick={() => onPick(x.key, manual && picks[x.key] === v.price ? null : v.price)}
                        className={`rounded-md border px-2 py-0.5 tabular-nums ${
                          manual && picks[x.key] === v.price
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-white/[0.1] text-muted-foreground hover:bg-white/[0.04]"
                        }`}
                      >
                        {money(v.price)} ₽
                      </button>
                    ))}
                    <span className="text-emerald-400">→ {money(price)} ₽</span>
                    <span className="text-muted-foreground">
                      {manual ? "выбрана вручную" : `по правилу: ${PRICE_RULES.find((r) => r.value === rule)?.label.toLowerCase()}`}
                    </span>
                    {manual && (
                      <button type="button" onClick={() => onPick(x.key, null)} className="text-muted-foreground underline">
                        сбросить
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showDiff && (
        <div className="rounded-lg border border-amber-500/30 divide-y divide-white/[0.06] text-xs">
          {diff.map((x) => (
            <div key={x.key} className="p-2">
              <div className="text-foreground">{x.name}</div>
              <div className="text-muted-foreground">
                {x.price_diff.map((p) => `${p.doc} (${p.date.split("-").reverse().join(".")}): ${money(p.price)} ₽`).join(" · ")}
                <span className="text-emerald-400"> → взята {money(priceOf(x))} ₽</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {catalog}
        {articles}
        <Missing title="Без артикула" list={items.filter((x) => !x.article)} />
        <Missing title="Без штрихкода" list={items.filter((x) => !x.barcodes.length)} />
        <Missing title="Без веса" list={items.filter((x) => !x.weight)} />
        <Missing title="Без ТН ВЭД" list={items.filter((x) => !x.tnved)} />
        <NoBrand
          list={items.filter((x) => noBrandKeys.has(x.key) || !brandOf(x).trim())}
          brandOf={brandOf}
          onBrand={onBrand}
        />
      </div>

      <div className="rounded-lg border border-white/[0.08] max-h-[420px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr className="text-left">
              <th className={`p-2 font-normal ${ART_W}`}>Артикул</th>
              {showCat && (
                <th className={`p-2 font-normal leading-tight ${ART_W} ${CAT_TH}`}>
                  Артикул
                  <br />
                  из каталога
                </th>
              )}
              <th className="p-2 font-normal">Наименование</th>
              {showCat && <th className={`p-2 font-normal ${CAT_TH}`}>Наименование из каталога</th>}
              <th className="p-2 font-normal">Штрихкод</th>
              <th className="p-2 font-normal">Бренд</th>
              {showCat && <th className={`p-2 font-normal ${CAT_TH}`}>Группа из каталога</th>}
              <th className="p-2 font-normal text-right">Вес</th>
              <th className="p-2 font-normal">Код ТНВЭД</th>
              <th className="p-2 font-normal text-right">Цена</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {items.map((x) => {
              const tw = twinsOf(x, items, twins);
              const auto = x.article_auto && !writtenKeys.has(x.key);
              const open = openRow === x.key;
              const m = cat?.[x.key];
              const c = m?.cards?.[0];
              const more = (m?.cards?.length || 0) - 1;
              const catOpen = openCat === x.key;
              const catTd = `p-2 ${CAT_TD}`;
              return (
                <Fragment key={x.key}>
                  <tr>
                    <td className={`p-2 align-top ${ART_W}`}>
                      <div className={`${ART_TXT} ${auto ? "text-sky-400" : ""}`}>{x.article || "—"}</div>
                      {tw.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpenRow(open ? null : x.key)}
                          className="mt-0.5 rounded px-1 text-[10px] leading-4 whitespace-nowrap bg-amber-500/15 text-amber-400"
                        >
                          Совпадает: {tw.length} {open ? "▴" : "▾"}
                        </button>
                      )}
                    </td>
                    {showCat && (
                      <td className={`${catTd} align-top ${ART_W}`}>
                        {c ? (
                          <>
                            <div className={ART_TXT}>{c.article || "—"}</div>
                            <div className="mt-0.5 flex flex-wrap gap-0.5">
                              <Marks c={c} />
                              {more > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setOpenCat(catOpen ? null : x.key)}
                                  className="rounded px-1 text-[10px] leading-4 whitespace-nowrap bg-white/[0.08] text-foreground"
                                >
                                  ещё {more} {catOpen ? "▴" : "▾"}
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className="p-2 min-w-[180px]">{x.name}</td>
                    {showCat && <td className={`${catTd} min-w-[180px]`}>{c?.name || "—"}</td>}
                    <td className="p-2 whitespace-nowrap tabular-nums">{x.barcodes.join(", ") || "—"}</td>
                    <td className="p-2 whitespace-nowrap">
                      <BrandInput
                        x={x}
                        value={brandOf(x)}
                        edited={brands[x.key] !== undefined && brands[x.key] !== guessBrand(x.name, x.group)}
                        onBrand={onBrand}
                      />
                    </td>
                    {showCat && <td className={`${catTd} whitespace-nowrap`}>{c?.group || "—"}</td>}
                    <td className="p-2 text-right tabular-nums">{x.weight || "—"}</td>
                    <td className="p-2 whitespace-nowrap tabular-nums">{x.tnved || "—"}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(priceOf(x))}</td>
                  </tr>
                  {catOpen && m && (
                    <tr>
                      <td colSpan={cols} className="px-2 pb-2 bg-emerald-500/[0.04]">
                        <div className="text-muted-foreground pt-1">Найдено в каталоге:</div>
                        <CardList cards={m.cards} />
                      </td>
                    </tr>
                  )}
                  {open && (
                    <tr>
                      <td colSpan={cols} className="px-2 pb-2 bg-amber-500/[0.04]">
                        <div className="text-muted-foreground pt-1">Товары с таким же артикулом:</div>
                        <TwinList list={tw} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WaybillResult;
