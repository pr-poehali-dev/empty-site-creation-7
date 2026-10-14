import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { buildBatchLabel, LABEL_SIZES, type BatchLabelData, type LabelSize } from "./batchLabelPdf";

const SIZE_KEY = "batch_label_size";

const readSize = (): LabelSize => {
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) || "");
    if (s.w >= 20 && s.h >= 20) return s;
  } catch {
    /* по умолчанию */
  }
  return LABEL_SIZES[0];
};

interface Props {
  data: BatchLabelData;
  onClose: () => void;
}

/** Наклейка партии: размер, предпросмотр, PDF и печать. */
const BatchLabelDialog = ({ data, onClose }: Props) => {
  const [size, setSize] = useState<LabelSize>(readSize);
  const [custom, setCustom] = useState(
    () => !LABEL_SIZES.some((s) => s.w === size.w && s.h === size.h)
  );
  const [cw, setCw] = useState(String(size.w));
  const [ch, setCh] = useState(String(size.h));
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let alive = true;
    let made = "";
    setBusy(true);
    buildBatchLabel(data, size)
      .then((doc) => {
        if (!alive) return;
        made = URL.createObjectURL(doc.output("blob"));
        setUrl(made);
      })
      .catch((e) => toast({ title: (e as Error).message, variant: "destructive" }))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [data, size]);

  const pick = (s: LabelSize) => {
    localStorage.setItem(SIZE_KEY, JSON.stringify(s));
    setSize(s);
  };

  const applyCustom = () => {
    const w = Math.round(Number(cw.replace(",", ".")));
    const h = Math.round(Number(ch.replace(",", ".")));
    if (!(w >= 20 && w <= 300 && h >= 20 && h <= 300)) {
      toast({ title: "Размер от 20 до 300 мм", variant: "destructive" });
      return;
    }
    pick({ w, h });
  };

  const fileName = `Партия ${data.number.replace(/\//g, "-")}.pdf`;

  const download = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const print = () => {
    try {
      frame.current?.contentWindow?.focus();
      frame.current?.contentWindow?.print();
    } catch {
      window.open(url, "_blank");
    }
  };

  const same = (s: LabelSize) => !custom && s.w === size.w && s.h === size.h;

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
                  pick(s);
                }}
                className={`h-9 px-3 rounded-lg border text-sm ${
                  same(s)
                    ? "border-violet-500/50 bg-violet-500/20 text-violet-100"
                    : "border-white/[0.1] bg-white/[0.03]"
                }`}
              >
                {s.w}×{s.h}
              </button>
            ))}
            <button
              onClick={() => setCustom(true)}
              className={`h-9 px-3 rounded-lg border text-sm ${
                custom
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-100"
                  : "border-white/[0.1] bg-white/[0.03]"
              }`}
            >
              Свой
            </button>
          </div>
          {custom && (
            <div className="flex items-center gap-2">
              <Input value={cw} onChange={(e) => setCw(e.target.value)} inputMode="numeric" className="h-10 w-20" />
              <span className="text-muted-foreground">×</span>
              <Input value={ch} onChange={(e) => setCh(e.target.value)} inputMode="numeric" className="h-10 w-20" />
              <span className="text-sm text-muted-foreground">мм</span>
              <Button className="h-10 ml-auto" onClick={applyCustom}>
                Применить
              </Button>
            </div>
          )}

          <div className="rounded-xl bg-white p-2 flex items-center justify-center min-h-[240px]">
            {busy || !url ? (
              <Icon name="Loader2" size={24} className="animate-spin text-neutral-500" />
            ) : (
              <iframe
                ref={frame}
                title="Наклейка"
                src={`${url}#toolbar=0&navpanes=0&view=Fit`}
                className="w-full h-[320px] border-0"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Размер {size.w}×{size.h} мм. Если на телефоне предпросмотр пустой — нажмите «PDF» и
            печатайте из открывшегося файла.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 border-white/[0.1]" disabled={!url} onClick={download}>
              <Icon name="FileDown" size={16} className="mr-1.5" />
              PDF
            </Button>
            <Button className="h-11" disabled={!url} onClick={print}>
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
