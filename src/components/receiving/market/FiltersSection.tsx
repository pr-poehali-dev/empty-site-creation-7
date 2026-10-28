import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import {
  SITE_COLUMNS,
  filtersCall,
  type FilterKey,
  type FiltersState,
  type Plaus,
} from "@/lib/marketPrices";

const LISTS: { key: FilterKey; title: string; rule: string; hint: string }[] = [
  {
    key: "preps",
    title: "Предлоги принадлежности",
    rule:
      "Если модель в названии стоит ПОСЛЕ одного из этих слов, это запчасть или аксессуар к товару, а не сам товар — карточка отбрасывается. Пример: «Бойлер для парогенератора Philips PSG7130/20».",
    hint: "Одно слово или фраза в строке",
  },
  {
    key: "parts",
    title: "Слова-запчасти",
    rule:
      "Если название карточки НАЧИНАЕТСЯ с одного из этих слов, это деталь или расходник — карточка отбрасывается. Можно писать начало слова: «щётк» поймает щётка, щётки, щёткой. Исключение: если название начинается с типа товара этой позиции (см. синонимы), оно не считается запчастью.",
    hint: "Одно слово или начало слова в строке",
  },
  {
    key: "synonyms",
    title: "Синонимы типов товара",
    rule:
      "Тип товара на маркете сверяется с товарной группой позиции в каталоге. Карточки, где перед моделью стоит нужный тип, идут в первую очередь; карточки другого типа берутся, только если нужного не нашлось. Группа подходит строке, если в её названии есть любое слово строки.",
    hint: "Одна строка — одна группа синонимов через запятую",
  },
];

const toText = (v: string[]) => v.join("\n");
const fromText = (t: string) =>
  t
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

const siteTitle = (s: string) => SITE_COLUMNS.find((c) => c.key === s)?.title || s;

const FiltersSection = () => {
  const [state, setState] = useState<FiltersState | null>(null);
  const [texts, setTexts] = useState<Record<FilterKey, string>>({ preps: "", parts: "", synonyms: "" });
  const [plaus, setPlaus] = useState<Plaus | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const apply = (d: FiltersState) => {
    setState(d);
    setTexts({
      preps: toText(d.filters.preps),
      parts: toText(d.filters.parts),
      synonyms: toText(d.filters.synonyms),
    });
    setPlaus(d.filters.plaus);
  };

  const call = async (tag: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(tag);
    setError("");
    setSaved("");
    try {
      apply(await filtersCall(action, extra));
      if (action !== "filters") setSaved(tag);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    call("load", "filters");
  }, []);

  if (!state || !plaus) {
    return (
      <p className="text-sm text-muted-foreground">
        {error || (busy === "load" ? "Загружаю..." : "")}
      </p>
    );
  }

  const changed = (k: FilterKey) => toText(fromText(texts[k])) !== toText(state.filters[k]);
  const plausChanged = JSON.stringify(plaus) !== JSON.stringify(state.filters.plaus);
  const plausOut = {
    ...plaus,
    site_ratio: String(plaus.site_ratio).replace(",", "."),
    cross_ratio: String(plaus.cross_ratio).replace(",", "."),
  };

  const footer = (tag: string, dirty: boolean, onSave: () => void) => (
    <div className="flex items-center gap-2">
      <Button size="sm" className="h-9" disabled={!dirty || busy !== ""} onClick={onSave}>
        {busy === tag ? <Icon name="Loader2" size={14} className="animate-spin mr-1" /> : null}
        Сохранить
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-9 text-muted-foreground"
        disabled={busy !== ""}
        onClick={() => {
          if (confirm("Вернуть этот блок к начальным значениям? Ваши правки в нём пропадут.")) {
            call(tag, "filters_reset", { key: tag });
          }
        }}
      >
        <Icon name="RotateCcw" size={14} className="mr-1" />
        Вернуть как было
      </Button>
      {saved === tag && <span className="text-xs text-emerald-300">Сохранено</span>}
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Правила отбора карточек при поиске цены. Применяются к следующему поиску — уже найденные цены
        обновятся после перепарсинга. Слова «уценка», «б/у», «восстановленный» и метки уценки на карточках
        отсекаются всегда.
      </p>
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {LISTS.map((l) => (
        <div key={l.key} className="rounded-xl border border-white/[0.08] p-3 space-y-2">
          <div className="flex items-baseline gap-2">
            <p className="font-medium text-sm flex-1">{l.title}</p>
            <span className="text-xs text-muted-foreground">{fromText(texts[l.key]).length} шт.</span>
          </div>
          <p className="text-xs text-muted-foreground">{l.rule}</p>
          <Textarea
            value={texts[l.key]}
            onChange={(e) => setTexts((t) => ({ ...t, [l.key]: e.target.value }))}
            placeholder={l.hint}
            rows={l.key === "synonyms" ? 10 : 7}
            className="text-sm font-mono"
          />
          <p className="text-[11px] text-muted-foreground">{l.hint}. Регистр и ё/е не важны.</p>
          {footer(l.key, changed(l.key), () => call(l.key, "filters_save", { key: l.key, value: fromText(texts[l.key]) }))}
        </div>
      ))}

      <div className="rounded-xl border border-white/[0.08] p-3 space-y-3">
        <p className="font-medium text-sm">Проверка цены на правдоподобие</p>
        {(
          [
            [
              "site",
              "Внутри сайта",
              "Если самая дешёвая подходящая карточка дешевле следующей подходящей больше чем в N раз — она пропускается и берётся следующая. Ловит запчасти и уценку, которые прошли остальные фильтры.",
            ],
            [
              "cross",
              "Между сайтами",
              "Если цена сайта ниже средней по остальным сайтам этой страны больше чем в N раз — она помечается жёлтым «проверить» и не идёт в «Цену РФ/РБ», пока её не подтвердят кнопкой «Цена верная».",
            ],
          ] as const
        ).map(([side, title, rule]) => (
          <div key={side} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Switch
                checked={plaus[`${side}_on`]}
                onCheckedChange={(v) => setPlaus((p) => (p ? { ...p, [`${side}_on`]: v } : p))}
              />
              <span className="text-sm flex-1">{title}</span>
              <span className="text-xs text-muted-foreground">в</span>
              <Input
                value={String(plaus[`${side}_ratio`])}
                onChange={(e) => setPlaus((p) => (p ? { ...p, [`${side}_ratio`]: e.target.value } : p))}
                inputMode="decimal"
                disabled={!plaus[`${side}_on`]}
                className="h-8 w-16 text-sm"
              />
              <span className="text-xs text-muted-foreground">раз</span>
            </div>
            <p className="text-xs text-muted-foreground">{rule}</p>
          </div>
        ))}
        {footer("plaus", plausChanged, () => call("plaus", "filters_save", { key: "plaus", value: plausOut }))}
      </div>

      <div className="rounded-xl border border-white/[0.08] p-3 space-y-2">
        <p className="font-medium text-sm">Исключённые карточки</p>
        <p className="text-xs text-muted-foreground">
          Сюда попадают карточки, отмеченные кнопкой «Не тот товар» в окне цены. Для этой модели на этом сайте
          они больше не берутся. Крестик возвращает карточку в поиск.
        </p>
        {state.excluded.length === 0 && <p className="text-sm text-muted-foreground">Пока пусто</p>}
        {state.excluded.map((x) => (
          <div key={x.id} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">
                {siteTitle(x.site)} · {[x.brand, x.model].filter(Boolean).join(" ")}
                {x.price != null ? ` · ${Number(x.price).toLocaleString("ru-RU")}` : ""}
              </div>
              {x.url ? (
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-300 break-words">
                  {x.title || x.url}
                </a>
              ) : (
                <div className="text-sm break-words">{x.title || "—"}</div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-red-300"
              disabled={busy !== ""}
              onClick={() => call(`ex:${x.id}`, "unexclude", { id: x.id })}
              aria-label="Вернуть в поиск"
            >
              <Icon name="X" size={15} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FiltersSection;
