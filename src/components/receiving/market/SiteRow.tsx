import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import Icon from "@/components/ui/icon";
import { money } from "@/lib/receivingCatalog";
import {
  BROWSER_SITES,
  METHOD_TITLES,
  STATUS_TEXT,
  type SiteMethod,
  type SiteSetting,
} from "@/lib/marketPrices";

interface Props {
  s: SiteSetting;
  testing: boolean;
  onSave: (patch: Partial<SiteSetting>) => void;
  onTest: () => void;
}

const when = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const Result = ({ s }: { s: SiteSetting }) => {
  if (!s.last_status) return <span className="text-muted-foreground">ещё не проверяли</span>;
  if (s.last_status === "ok") {
    return (
      <span className="text-emerald-300">
        <Icon name="CircleCheck" size={14} className="inline mr-1 -mt-0.5" />
        {money(s.last_price)} {s.cur} — {s.last_title}
      </span>
    );
  }
  const tone = s.last_status === "not_found" ? "text-muted-foreground" : "text-amber-300";
  return (
    <span className={tone}>
      <Icon name="TriangleAlert" size={14} className="inline mr-1 -mt-0.5" />
      {s.last_message || STATUS_TEXT[s.last_status] || s.last_status}
    </span>
  );
};

const SiteRow = ({ s, testing, onSave, onTest }: Props) => {
  const [brand, setBrand] = useState(s.test_brand);
  const [model, setModel] = useState(s.test_model);
  const methods: SiteMethod[] = BROWSER_SITES.includes(s.site)
    ? ["direct", "proxy", "browser"]
    : ["direct", "proxy"];

  useEffect(() => {
    setBrand(s.test_brand);
    setModel(s.test_model);
  }, [s.test_brand, s.test_model]);

  const saveTest = () => {
    if (brand !== s.test_brand || model !== s.test_model) {
      onSave({ test_brand: brand, test_model: model });
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-background/40 p-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <Switch checked={s.enabled} onCheckedChange={(v) => onSave({ enabled: v })} />
        <span className="font-medium flex-1 min-w-[120px]">
          {s.title} <span className="text-xs text-muted-foreground">{s.cur}</span>
        </span>
        <div className="flex rounded-lg border border-white/[0.08] p-0.5 text-xs">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => m !== s.method && onSave({ method: m })}
              className={`rounded-md px-2 py-1 transition-colors ${
                s.method === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {METHOD_TITLES[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          onBlur={saveTest}
          placeholder="Бренд"
          className="h-8 w-28 text-sm"
        />
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={saveTest}
          placeholder="Модель"
          className="h-8 flex-1 min-w-[100px] text-sm"
        />
        <Button size="sm" variant="outline" className="h-8" disabled={testing} onClick={onTest}>
          {testing ? (
            <Icon name="Loader2" size={14} className="mr-1 animate-spin" />
          ) : (
            <Icon name="PlayCircle" size={14} className="mr-1" />
          )}
          Проверить
        </Button>
      </div>
      <div className="text-xs leading-relaxed">
        <Result s={s} />
        {s.last_at && <span className="ml-2 text-muted-foreground">{when(s.last_at)}</span>}
      </div>
    </div>
  );
};

export default SiteRow;