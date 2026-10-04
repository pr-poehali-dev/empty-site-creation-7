import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, SEARCH_DICTS_URL, PARSE_STATUS_COLORS, PARSE_STATUS_LABELS } from "./api";

interface Row {
  id: number;
  name: string;
  article: string | null;
  group: string | null;
  model: string | null;
  feature: string | null;
  status: "parsed" | "doubtful";
}

interface Report {
  brand: string;
  total: number;
  counts: { parsed: number; doubtful: number };
  skipped_manual: number;
  groups: [string, number][];
  items: Row[];
}

interface Props {
  brandId: number;
  onClose: () => void;
  onApplied: () => void;
}

const PAGE = 100;

const ParsePreview = ({ brandId, onClose, onApplied }: Props) => {
  const { toast } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [filter, setFilter] = useState<"all" | "parsed" | "doubtful">("doubtful");
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${SEARCH_DICTS_URL}?section=parse&brand_id=${brandId}`, { headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Не удалось разобрать");
        setReport(d);
        if (!d.counts.doubtful) setFilter("all");
      } catch (e) {
        toast({ title: (e as Error).message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [brandId]);

  const rows = useMemo(() => {
    if (!report) return [];
    const ql = q.trim().toLowerCase();
    return report.items.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!group || r.group === group) &&
        (!ql || r.name.toLowerCase().includes(ql)),
    );
  }, [report, filter, group, q]);

  useEffect(() => setLimit(PAGE), [filter, group, q]);

  const apply = async () => {
    if (!report) return;
    if (!confirm(`Записать разбор ${report.total} товаров ${report.brand} в каталог?`)) return;
    setApplying(true);
    try {
      const r = await fetch(`${SEARCH_DICTS_URL}?section=parse&brand_id=${brandId}`, {
        method: "POST",
        headers: authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось записать");
      toast({ title: `Записано: ${d.applied} товаров, новых групп: ${d.groups_created}` });
      onApplied();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Icon name="Loader2" size={24} className="animate-spin mx-auto mb-2" />
        Разбираю наименования
      </div>
    );
  }
  if (!report) return null;

  const chip = (key: "all" | "parsed" | "doubtful", label: string, n: number, cls: string) => (
    <button
      onClick={() => setFilter(key)}
      className={`rounded-xl border p-3 text-left transition-colors ${filter === key ? "border-primary bg-primary/10" : "border-white/[0.08] hover:bg-white/[0.03]"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${cls}`}>{n.toLocaleString("ru-RU")}</p>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <Icon name="ArrowLeft" size={20} />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Разбор {report.brand}</h2>
          <p className="text-xs text-muted-foreground">
            Предпросмотр — в каталог ничего не записано.
            {report.skipped_manual > 0 && ` Исправленные вручную (${report.skipped_manual}) не трогаю.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {chip("all", "Всего", report.total, "")}
        {chip("parsed", "Разобрано", report.counts.parsed, "text-emerald-400")}
        {chip("doubtful", "Сомнительно", report.counts.doubtful, "text-amber-400")}
      </div>

      <div className="rounded-xl border border-white/[0.08] p-3 text-xs text-muted-foreground space-y-1">
        <p>
          Разбор идёт только по наименованию: группа — до бренда, модель — код или слова сразу после бренда,
          признак — всё остальное.
        </p>
        <p>
          <span className="text-foreground font-medium">Сомнительно</span> — не удалось выделить группу или модель.
          Их можно исправить в карточке после записи.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="h-9 rounded-xl bg-secondary border border-white/[0.08] px-3 text-sm max-w-[16rem]"
        >
          <option value="">Все группы ({report.groups.length})</option>
          {report.groups.map(([g, n]) => (
            <option key={g} value={g}>{g} — {n}</option>
          ))}
        </select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию"
          className="h-9 w-56 rounded-xl bg-secondary border-white/[0.08]"
        />
        <Button className="ml-auto rounded-xl" onClick={apply} disabled={applying || report.total === 0}>
          {applying ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Save" size={14} />}
          <span className="ml-2">Записать в каталог</span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Показано {Math.min(limit, rows.length)} из {rows.length}</p>

      <div className="space-y-2">
        {rows.slice(0, limit).map((r) => (
          <div key={r.id} className="rounded-xl border border-white/[0.08] p-3">
            <div className="flex items-start gap-2">
              <p className="text-sm flex-1 min-w-0 break-words">{r.name}</p>
              <Badge className={`text-[10px] shrink-0 ${PARSE_STATUS_COLORS[r.status]}`}>{PARSE_STATUS_LABELS[r.status]}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-2 text-xs">
              <div><span className="text-muted-foreground">Группа: </span>{r.group || <span className="text-rose-400">—</span>}</div>
              <div><span className="text-muted-foreground">Модель: </span>{r.model || <span className="text-rose-400">—</span>}</div>
              <div><span className="text-muted-foreground">Признак: </span>{r.feature || "—"}</div>
              <div><span className="text-muted-foreground">Артикул: </span>{r.article || "—"}</div>
            </div>
          </div>
        ))}
      </div>
      {rows.length > limit && (
        <Button variant="outline" className="w-full rounded-xl" onClick={() => setLimit(limit + PAGE)}>
          Показать ещё
        </Button>
      )}
    </div>
  );
};

export default ParsePreview;