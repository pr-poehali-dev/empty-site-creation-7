import { useState } from "react";
import Icon from "@/components/ui/icon";
import { PRICE_RULES, PriceRule, WbBuild, WbItem, finalPrice, guessBrand, isMultiPrice } from "./api";

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
}

const WaybillResult = ({ data, rule, picks, onRule, onPick }: Props) => {
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
        <Missing title="Без артикула" list={items.filter((x) => !x.article)} />
        <Missing title="Без штрихкода" list={items.filter((x) => !x.barcodes.length)} />
        <Missing title="Без веса" list={items.filter((x) => !x.weight)} />
        <Missing title="Без ТН ВЭД" list={items.filter((x) => !x.tnved)} />
        <Missing title="Бренд не определён" list={items.filter((x) => !guessBrand(x.name, x.group))} />
      </div>

      <div className="rounded-lg border border-white/[0.08] max-h-[420px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr className="text-left">
              <th className="p-2 font-normal">Артикул</th>
              <th className="p-2 font-normal">Наименование</th>
              <th className="p-2 font-normal">Штрихкод</th>
              <th className="p-2 font-normal">Бренд</th>
              <th className="p-2 font-normal">Категория</th>
              <th className="p-2 font-normal text-right">Вес</th>
              <th className="p-2 font-normal">Код ТНВЭД</th>
              <th className="p-2 font-normal text-right">Цена</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {items.map((x) => (
              <tr key={x.key}>
                <td className="p-2 whitespace-nowrap">{x.article || "—"}</td>
                <td className="p-2 min-w-[220px]">{x.name}</td>
                <td className="p-2 whitespace-nowrap tabular-nums">{x.barcodes.join(", ") || "—"}</td>
                <td className="p-2 whitespace-nowrap">{guessBrand(x.name, x.group) || "—"}</td>
                <td className="p-2 whitespace-nowrap">{x.group || "—"}</td>
                <td className="p-2 text-right tabular-nums">{x.weight || "—"}</td>
                <td className="p-2 whitespace-nowrap tabular-nums">{x.tnved || "—"}</td>
                <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(priceOf(x))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WaybillResult;
