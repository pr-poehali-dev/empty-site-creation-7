import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Icon from "@/components/ui/icon";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  bytes: ArrayBuffer | null;
  w: number;
  h: number;
}

/** Предпросмотр наклейки: страница PDF, нарисованная картинкой в пропорциях листа. */
const LabelPreview = ({ bytes, w, h }: Props) => {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState(false);
  const [boxW, setBoxW] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const maxH = 340;
  const scale = Math.min(boxW / w, maxH / h) || 0;
  const cssW = Math.round(w * scale);
  const cssH = Math.round(h * scale);

  useEffect(() => {
    if (!bytes || !cssW || !canvas.current) return;
    let alive = true;
    let task: { cancel: () => void } | null = null;
    setErr(false);
    const load = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
    load.promise
      .then(async (pdf) => {
        const page = await pdf.getPage(1);
        if (!alive || !canvas.current) return;
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const vp = page.getViewport({ scale: (cssW / base.width) * dpr });
        const c = canvas.current;
        c.width = Math.round(vp.width);
        c.height = Math.round(vp.height);
        const rt = page.render({ canvas: c, viewport: vp });
        task = rt;
        await rt.promise;
      })
      .catch((e: Error) => {
        if (alive && e?.name !== "RenderingCancelledException") setErr(true);
      });
    return () => {
      alive = false;
      task?.cancel();
      load.destroy();
    };
  }, [bytes, cssW]);

  return (
    <div ref={box} className="w-full flex items-center justify-center" style={{ minHeight: 160 }}>
      {!bytes || !cssW ? (
        <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
      ) : err ? (
        <p className="text-sm text-muted-foreground">Не удалось показать предпросмотр — откройте PDF</p>
      ) : (
        <canvas
          ref={canvas}
          className="bg-white rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_6px_24px_rgba(0,0,0,0.5)]"
          style={{ width: cssW, height: cssH }}
        />
      )}
    </div>
  );
};

export default LabelPreview;
