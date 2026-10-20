import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Country1C, CountryKind, SiteProduct, isTraceable, normCountry } from "@/pages/odata/nomenApi";

const NONE = "__none";

interface Props {
  value: string;
  info: CountryKind;
  countries: Country1C[];
  onChange: (key: string) => void;
  siteName?: string;
  lookup?: (() => Promise<SiteProduct>) | null;
  fromSite?: boolean;
  onSite?: (key: string, p: SiteProduct) => void;
  fromFile?: boolean;
  fileCountry?: string;
}

const NomenCountryField = ({ value, info, countries, onChange, siteName, lookup, fromSite, onSite, fromFile, fileCountry }: Props) => {
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ c: Country1C; p: SiteProduct } | null>(null);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  const find = async () => {
    if (!lookup) return;
    setBusy(true);
    setMsg("");
    setFound(null);
    try {
      const p = await lookup();
      if (!p.found) setMsg(p.reason || "нет на сайте");
      else if (!p.country) setMsg("на сайте нет страны");
      else {
        const c = countries.find((x) => normCountry(x.name) === normCountry(p.country || ""));
        if (c) setFound({ c, p });
        else setMsg(`на сайте: ${p.country} — в справочнике 1С нет`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "сайт не ответил");
    }
    setBusy(false);
  };

  const name = (k: string) => countries.find((c) => c.key === k)?.name || "страна из 1С";
  const used = new Set(info.options.map((o) => o.key));
  const rest = countries.filter((c) => !used.has(c.key));
  const traceable = isTraceable(value, countries);
  const fileUnknown = !!fileCountry && !countries.some((c) => normCountry(c.name) === normCountry(fileCountry));

  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">Страна происхождения</span>
      <Select
        value={value || NONE}
        onValueChange={(v) => onChange(v === NONE ? "" : v)}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setFound(null);
            setMsg("");
          }
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {lookup && (
            <>
              <div className="px-1 py-1">
                <button
                  type="button"
                  onClick={find}
                  disabled={busy}
                  className="w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 rounded hover:bg-white/[0.04]"
                >
                  <Icon name={busy ? "Loader2" : "Globe"} size={14} className={busy ? "animate-spin" : "text-primary"} />
                  Найти на сайте {siteName}
                </button>
                {found && (
                  <div className="px-2 pb-1.5 flex items-center gap-2">
                    <span className="text-sm font-semibold flex-1">{found.c.name}</span>
                    <Button size="sm" onClick={() => {
                        onSite?.(found.c.key, found.p);
                        setOpen(false);
                        setFound(null);
                      }}>
                      Подставить
                    </Button>
                  </div>
                )}
                {msg && <div className="px-2 pb-1.5 text-xs text-amber-400">{msg}</div>}
              </div>
              <SelectSeparator />
            </>
          )}
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground font-normal">
              У похожих: {info.basis.toLowerCase()}, {info.similar}
            </SelectLabel>
            {info.options.map((o) => (
              <SelectItem key={o.key || NONE} value={o.key || NONE}>
                {o.key ? name(o.key) : "Не указывать"} · у {o.count}
              </SelectItem>
            ))}
            {!used.has("") && <SelectItem value={NONE}>Не указывать</SelectItem>}
          </SelectGroup>
          {rest.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground font-normal">Другие страны</SelectLabel>
                {rest.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      <span className={`block text-[11px] leading-tight ${traceable ? "text-amber-400" : "text-muted-foreground"}`}>
        {fromSite && value ? "с сайта · " : fromFile && value ? "из файла · " : ""}Прослеживаемый: {traceable ? "да" : "нет"}
      </span>
      {fileUnknown && (
        <span className="block text-[11px] leading-tight text-amber-400">
          в файле: {fileCountry} — в справочнике 1С нет
        </span>
      )}
    </label>
  );
};

export default NomenCountryField;
