import { useState } from "react";
import Icon from "@/components/ui/icon";
import { WbBuild, WbItem, guessBrand } from "./api";

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

const WaybillResult = ({ data }: { data: WbBuild }) => {
  const [showDiff, setShowDiff] = useState(false);
  const items = data.items;
  const diff = items.filter((x) => x.price_diff.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-md px-2 py-1 bg-emerald-500/10 text-emerald-400">Товаров: {items.length}</span>
        <span className="rounded-md px-2 py-1 bg-white/[0.06] text-muted-foreground">
          Строк в накладных: {data.lines}
        </span>
        {diff.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDiff(!showDiff)}
            className="rounded-md px-2 py-1 bg-amber-500/10 text-amber-400"
          >
            Разные цены: {diff.length} · {showDiff ? "скрыть" : "показать"}
          </button>
        )}
      </div>

      {showDiff && (
        <div className="rounded-lg border border-amber-500/30 divide-y divide-white/[0.06] text-xs">
          {diff.map((x) => (
            <div key={x.key} className="p-2">
              <div className="text-foreground">{x.name}</div>
              <div className="text-muted-foreground">
                {x.price_diff.map((p) => `${p.doc} (${p.date.split("-").reverse().join(".")}): ${money(p.price)} ₽`).join(" · ")}
                <span className="text-emerald-400"> → взята {money(x.price)} ₽</span>
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
                <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(x.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WaybillResult;
