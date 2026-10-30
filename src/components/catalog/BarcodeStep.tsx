import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import BarcodeItemsSheet, { BARCODE_TITLES, BarcodeGroup, BarcodeItem } from "./BarcodeItemsSheet";

interface BarcodeReport {
  counts: Record<BarcodeGroup, number>;
  items: Record<BarcodeGroup, BarcodeItem[]>;
  file_name?: string;
  supplier_name?: string;
}

interface Props {
  url: string;
  headers: Record<string, string>;
  draftId: number;
  onFinish: () => void;
  onBusy: (busy: boolean) => void;
  onSkip?: () => void;
}

const TILES: { g: BarcodeGroup; cls: string }[] = [
  { g: "all", cls: "" },
  { g: "own", cls: "" },
  { g: "add", cls: "text-primary" },
  { g: "foreign", cls: "text-destructive" },
  { g: "dups", cls: "" },
];

const BarcodeStep = ({ url, headers, draftId, onFinish, onBusy, onSkip }: Props) => {
  const [rep, setRep] = useState<BarcodeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<BarcodeGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 0, added: 0, skipped: 0 });
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState("");
  const hdr = useRef(headers);
  hdr.current = headers;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: hdr.current,
        body: JSON.stringify({ action: "barcodes_preview", draft_id: draftId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Не удалось сверить штрихкоды");
      setRep(d.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url, draftId]);

  useEffect(() => {
    load();
  }, [load]);

  const write = async () => {
    setSaving(true);
    onBusy(true);
    setSaveError("");
    let st = { ...prog };
    try {
      while (true) {
        const r = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "barcodes_commit", draft_id: draftId, offset: st.done, limit: 300 }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Сервер не ответил, попробуйте продолжить");
        const res = d.result;
        st = { done: res.done, total: res.total, added: st.added + res.added, skipped: st.skipped + res.skipped };
        setProg(st);
        if (res.finished) {
          setFinished(true);
          break;
        }
      }
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
      onBusy(false);
    }
  };

  if (finished) {
    const notAdded = (rep?.counts.foreign ?? 0) + (rep?.counts.own ?? 0);
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950 p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <Icon name="CircleCheck" size={18} className="text-emerald-400" />
          Штрихкоды записаны
        </div>
        <div className="text-sm text-muted-foreground">
          Добавлено {prog.added}. Не добавлено {notAdded}: уже у этого товара {rep?.counts.own ?? 0}, заняты
          другим товаром {rep?.counts.foreign ?? 0}.
        </div>
        <Button className="rounded-xl w-full" onClick={onFinish}>
          Дальше: цены
          <Icon name="ArrowRight" size={18} className="ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-muted-foreground">Сверка штрихкодов</div>
        {rep?.file_name && (
          <div className="text-xs text-muted-foreground truncate">
            {rep.supplier_name ? `${rep.supplier_name} · ` : ""}
            {rep.file_name}
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-muted-foreground">Сверяю штрихкоды…</div>}
      {error && (
        <div className="space-y-2">
          <div className="text-sm text-destructive">{error}</div>
          <Button variant="secondary" className="rounded-xl" onClick={load}>
            Повторить
          </Button>
        </div>
      )}

      {rep && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {TILES.map(({ g, cls }) => {
              const n = rep.counts[g] ?? 0;
              const can = n > 0;
              return (
                <button
                  key={g}
                  type="button"
                  disabled={!can}
                  onClick={() => setOpen(g)}
                  className={`rounded-xl bg-secondary p-3 transition-colors ${
                    g === "all" ? "col-span-2 sm:col-span-1" : ""
                  } ${can ? "hover:bg-secondary/70 active:scale-[0.98] cursor-pointer" : "cursor-default"}`}
                >
                  <div className={`text-lg font-semibold ${n > 0 ? cls : ""}`}>{n}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 leading-tight">
                    {BARCODE_TITLES[g].replace("Штрихкоды в файле", "в файле").toLowerCase()}
                    {can && <Icon name="ChevronRight" size={12} className="shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          {rep.counts.foreign > 0 && (
            <button
              type="button"
              onClick={() => setOpen("foreign")}
              className="w-full text-left rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2 items-start hover:bg-destructive/15"
            >
              <Icon name="TriangleAlert" size={16} className="text-destructive mt-0.5 shrink-0" />
              <span className="flex-1">
                {rep.counts.foreign} штрихкодов из файла уже есть у других товаров в каталоге — они не будут
                добавлены
              </span>
              <Icon name="ChevronRight" size={16} className="text-muted-foreground mt-0.5 shrink-0" />
            </button>
          )}

          {saveError && <div className="text-sm text-destructive">{saveError}</div>}

          <Button onClick={write} disabled={saving} className="rounded-xl w-full">
            {saving
              ? `Записываю… ${prog.done} из ${prog.total}`
              : saveError
                ? "Продолжить запись"
                : rep.counts.add > 0
                  ? `Записать штрихкоды: ${rep.counts.add}`
                  : "Дальше: цены"}
          </Button>
          {onSkip && rep.counts.add > 0 && !saving && (
            <Button variant="ghost" onClick={onSkip} className="rounded-xl w-full">
              Пропустить штрихкоды, к ценам
            </Button>
          )}

          <BarcodeItemsSheet
            group={open}
            items={open ? rep.items[open] || [] : []}
            onClose={() => setOpen(null)}
          />
        </>
      )}
    </div>
  );
};

export default BarcodeStep;
