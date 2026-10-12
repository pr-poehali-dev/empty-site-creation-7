import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InvoiceItem, MatchItem } from "@/pages/odata/nomenApi";

export type CaseKind = "other" | "taken";

interface Props {
  kind: CaseKind;
  items: InvoiceItem[];
  matches: (MatchItem | null)[];
}

const norm = (s: string) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

const Cell = ({ top, bottom, same }: { top: React.ReactNode; bottom: React.ReactNode; same?: boolean }) => {
  const tone = same === undefined ? "text-foreground/90" : same ? "text-emerald-400" : "text-amber-400";
  return (
    <div className="min-w-0 space-y-1 break-words">
      <div className={tone}>
        <span className="block text-[10px] text-muted-foreground">1С</span>
        {top}
      </div>
      <div className={tone}>
        <span className="block text-[10px] text-muted-foreground">счёт</span>
        {bottom}
      </div>
    </div>
  );
};

const NomenBarcodeCases = ({ kind, items, matches }: Props) => {
  const [q, setQ] = useState("");
  const [diffFirst, setDiffFirst] = useState(false);

  const cases = useMemo(
    () =>
      matches
        .map((m, i) => ({ m, it: items[i], i }))
        .filter(({ m }) => m?.bc?.state === kind)
        .map(({ m, it, i }) => {
          const card = m!.cards.find((c) => c.key === m!.card_key) || m!.cards.find((c) => !c.deleted);
          const owner = m!.bc?.owner;
          const ref =
            kind === "taken"
              ? { article: owner?.article || "", name: owner?.name || "", code: owner?.code || "" }
              : { article: card?.article || "", name: card?.name || "", code: card?.code || "" };
          const sameArt = norm(ref.article) === norm(it.article) && !!ref.article;
          const sameName = norm(ref.name) === norm(it.name) && !!ref.name;
          return { i, it, ref, card, have: m!.bc?.have || [], sameArt, sameName };
        }),
    [items, matches, kind],
  );

  const shown = useMemo(() => {
    const t = norm(q);
    let list = t
      ? cases.filter((c) =>
          [c.ref.article, c.ref.name, c.it.article, c.it.name, c.it.barcode, ...c.have].some((v) =>
            norm(v).includes(t),
          ),
        )
      : cases;
    if (diffFirst) list = [...list].sort((a, b) => +(a.sameArt && a.sameName) - +(b.sameArt && b.sameName));
    return list;
  }, [cases, q, diffFirst]);

  return (
    <div className="rounded-lg border border-white/[0.08] bg-background/40 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-b border-white/[0.06]">
        <span className="text-muted-foreground">
          Показано {shown.length} из {cases.length}
        </span>
        <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
          <Switch checked={diffFirst} onCheckedChange={setDiffFirst} />
          Сначала расхождения
        </label>
        {cases.length > 10 && (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Артикул, наименование или ШК"
            className="h-8 text-xs w-full sm:w-64"
          />
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,1.1fr)] gap-x-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-white/[0.06]">
        <span>Артикул</span>
        <span>Наименование</span>
        <span>Штрихкод(ы)</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto divide-y divide-white/[0.06]">
        {shown.map((c) => (
          <div key={c.i} className="px-3 py-2">
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,1.1fr)] gap-x-3">
              <Cell top={c.ref.article || "—"} bottom={c.it.article || "—"} same={c.sameArt} />
              <Cell top={c.ref.name || "—"} bottom={c.it.name || "—"} same={c.sameName} />
              <Cell
                top={
                  kind === "taken" ? (
                    <span className="block">{c.it.barcode}</span>
                  ) : c.have.length ? (
                    c.have.map((b) => (
                      <span key={b} className="block">
                        {b}
                      </span>
                    ))
                  ) : (
                    "—"
                  )
                }
                bottom={c.it.barcode || "—"}
              />
            </div>
            {kind === "taken" && c.card && (
              <div className="text-[11px] text-muted-foreground mt-1.5">
                Найдена для позиции: {c.card.code} — {c.card.name}
              </div>
            )}
          </div>
        ))}
        {!shown.length && <div className="px-3 py-3 text-muted-foreground">Ничего не найдено</div>}
      </div>
    </div>
  );
};

export default NomenBarcodeCases;
