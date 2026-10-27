import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import {
  buildBatchLabel,
  LABEL_SIZES,
  orientSize,
  type BatchLabelData,
  type LabelSize,
  type Orient,
} from "./batchLabelPdf";
import LabelPreview from "./LabelPreview";
import { addLabelSize, deleteLabelSize, loadLabelSizes, type SavedLabelSize } from "@/lib/batches";

const SIZE_KEY = "batch_label_size";
const ORIENT_KEY = "batch_label_orient";

const readSize = (): LabelSize => {
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) || "");
    if (s.w >= 20 && s.h >= 20) return { w: s.w, h: s.h };
  } catch {
    /* по умолчанию */
  }
  return LABEL_SIZES[0];
};

const readOrient = (base: LabelSize): Orient => {
  const o = localStorage.getItem(ORIENT_KEY);
  if (o === "portrait" || o === "landscape") return o;
  return base.w >= base.h ? "landscape" : "portrait";
};

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const sameDims = (a: LabelSize, b: LabelSize) =>
  Math.min(a.w, a.h) === Math.min(b.w, b.h) && Math.max(a.w, a.h) === Math.max(b.w, b.h);

const chip = (on: boolean) =>
  `h-9 px-3 rounded-lg border text-sm whitespace-nowrap ${
    on ? "border-violet-500/50 bg-violet-500/20 text-violet-100" : "border-white/[0.1] bg-white/[0.03]"
  }`;

interface Props {
  data: BatchLabelData;
  onClose: () => void;
}

/** Наклейка партии: размер и ориентация, свои размеры, предпросмотр, PDF и печать. */
const BatchLabelDialog = ({ data, onClose }: Props) => {
  const [base, setBase] = useState<LabelSize>(readSize);
  const [orient, setOrient] = useState<Orient>(() => readOrient(readSize()));
  const [saved, setSaved] = useState<SavedLabelSize[]>([]);
  const [custom, setCustom] = useState(false);
  const [cw, setCw] = useState(String(base.w));
  const [ch, setCh] = useState(String(base.h));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [busy, setBusy] = useState(true);

  const size = useMemo(() => orientSize(base, orient), [base, orient]);

  const reloadSaved = useCallback(() => {
    loadLabelSizes()
      .then((r) => setSaved(r.sizes))
      .catch(() => setSaved([]));
  }, []);

  useEffect(reloadSaved, [reloadSaved]);

  useEffect(() => {
    let alive = true;
    let made = "";
    setBusy(true);
    setBytes(null);
    buildBatchLabel(data, size)
      .then((doc) => {
        if (!alive) return;
        made = URL.createObjectURL(doc.output("blob"));
        setUrl(made);
        setBytes(doc.output("arraybuffer"));
      })
      .catch((e) => toast({ title: (e as Error).message, variant: "destructive" }))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [data, size]);

  const pick = (s: LabelSize, keepOrient = true) => {
    const next = { w: s.w, h: s.h };
    localStorage.setItem(SIZE_KEY, JSON.stringify(next));
    setBase(next);
    if (!keepOrient) changeOrient(s.w >= s.h ? "landscape" : "portrait");
  };

  const changeOrient = (o: Orient) => {
    localStorage.setItem(ORIENT_KEY, o);
    setOrient(o);
  };

  const readCustom = (): LabelSize | null => {
    const w = Math.round(Number(cw.replace(",", ".")));
    const h = Math.round(Number(ch.replace(",", ".")));
    if (!(w >= 20 && w <= 300 && h >= 20 && h <= 300)) {
      toast({ title: "Размер от 20 до 300 мм", variant: "destructive" });
      return null;
    }
    return { w, h };
  };

  const applyCustom = () => {
    const s = readCustom();
    if (s) pick(s, false);
  };

  const startSave = () => {
    const s = readCustom();
    if (!s) return;
    pick(s, false);
    setName("");
    setNaming(true);
  };

  const saveCustom = async () => {
    const s = readCustom();
    const n = name.trim();
    if (!s) return;
    if (!n) {
      toast({ title: "Назовите размер", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await addLabelSize(n, s.w, s.h);
      setNaming(false);
      setCustom(false);
      reloadSaved();
      toast({ title: `Размер «${n}» сохранён` });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const removeSaved = async (s: SavedLabelSize) => {
    if (!confirm(`Удалить размер «${s.name}» ${s.w}×${s.h}?`)) return;
    try {
      await deleteLabelSize(s.id);
      setSaved((list) => list.filter((x) => x.id !== s.id));
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const fileName = `Партия ${data.number.replace(/\//g, "-")}.pdf`;

  const download = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const print = async () => {
    if (!url || !bytes) return;
    if (isMobile()) {
      const file = new File([bytes], fileName, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: fileName });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      download();
      toast({ title: "PDF скачан — откройте его из уведомления и нажмите «Печать»" });
      return;
    }
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, "_blank");
      }
      setTimeout(() => frame.remove(), 60000);
    };
    document.body.appendChild(frame);
  };

  const presetOn = (s: LabelSize) => !custom && sameDims(s, base);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75">
      <div className="w-full sm:max-w-lg bg-card border-t sm:border border-white/[0.1] rounded-t-2xl sm:rounded-2xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-white/[0.08] px-4 py-3 flex items-center gap-2">
          <p className="flex-1 font-semibold">Наклейка партии</p>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <Icon name="X" size={18} />
          </Button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {LABEL_SIZES.map((s) => (
              <button
                key={`${s.w}x${s.h}`}
                onClick={() => {
                  setCustom(false);
                  pick(s, !!s.name);
                }}
                className={chip(presetOn(s))}
              >
                {s.name || `${s.w}×${s.h}`}
              </button>
            ))}
            {saved.map((s) => (
              <div key={s.id} className={`${chip(presetOn(s))} flex items-center gap-1 pr-1`}>
                <button
                  onClick={() => {
                    setCustom(false);
                    pick(s, false);
                  }}
                  className="h-full flex items-center gap-1.5"
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.w}×{s.h}
                  </span>
                </button>
                <button
                  onClick={() => removeSaved(s)}
                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400"
                  aria-label="Удалить размер"
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                setCustom(true);
                setCw(String(size.w));
                setCh(String(size.h));
              }}
              className={chip(custom)}
            >
              Свой
            </button>
          </div>

          {custom && (
            <div className="space-y-2 rounded-lg border border-white/[0.08] p-2.5">
              <div className="flex items-center gap-2">
                <Input value={cw} onChange={(e) => setCw(e.target.value)} inputMode="numeric" className="h-10 w-20" />
                <span className="text-muted-foreground">×</span>
                <Input value={ch} onChange={(e) => setCh(e.target.value)} inputMode="numeric" className="h-10 w-20" />
                <span className="text-sm text-muted-foreground">мм</span>
              </div>
              {naming ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveCustom()}
                    placeholder="Название, например «Термо Xprinter»"
                    maxLength={60}
                    className="h-10 flex-1"
                  />
                  <Button className="h-10" disabled={saving} onClick={saveCustom}>
                    {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : "Сохранить"}
                  </Button>
                  <Button variant="ghost" className="h-10 px-2" onClick={() => setNaming(false)}>
                    <Icon name="X" size={16} />
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-10 border-white/[0.1]" onClick={applyCustom}>
                    Применить
                  </Button>
                  <Button variant="outline" className="h-10 border-white/[0.1]" onClick={startSave}>
                    <Icon name="BookmarkPlus" size={16} className="mr-1.5" />
                    В список
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ["portrait", "Книжная", "RectangleVertical"],
                ["landscape", "Альбомная", "RectangleHorizontal"],
              ] as const
            ).map(([o, label, icon]) => (
              <button
                key={o}
                onClick={() => changeOrient(o)}
                className={`${chip(orient === o)} flex items-center justify-center gap-1.5`}
              >
                <Icon name={icon} size={16} />
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
            <LabelPreview bytes={busy ? null : bytes} w={size.w} h={size.h} />
          </div>
          <p className="text-xs text-muted-foreground">
            Размер {size.w}×{size.h} мм, {orient === "portrait" ? "книжная" : "альбомная"}.
            {isMobile() ? " «Печать» откроет PDF — выберите просмотрщик или приложение принтера." : ""}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 border-white/[0.1]" disabled={!url || busy} onClick={download}>
              <Icon name="FileDown" size={16} className="mr-1.5" />
              PDF
            </Button>
            <Button className="h-11" disabled={!url || busy} onClick={print}>
              <Icon name="Printer" size={16} className="mr-1.5" />
              Печать
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchLabelDialog;
