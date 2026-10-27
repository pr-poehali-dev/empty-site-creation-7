import { useCallback, useEffect, useState, type RefObject } from "react";

interface Props {
  wrapRef: RefObject<HTMLDivElement>;
  anchorRef: RefObject<HTMLTableCellElement>;
  names: { id: number; name: string }[];
}

interface Place {
  id: number;
  top: number;
}

const FloatingNames = ({ wrapRef, anchorRef, names }: Props) => {
  const [left, setLeft] = useState(0);
  const [width, setWidth] = useState(0);
  const [show, setShow] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const th = anchorRef.current;
    if (!wrap || !th) {
      setShow(false);
      return;
    }
    setLeft(wrap.scrollLeft);
    setWidth(wrap.clientWidth);
    setShow(th.offsetLeft + th.offsetWidth < wrap.scrollLeft + 8);
    const rows = wrap.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row-id]");
    const next: Place[] = [];
    rows.forEach((tr) => {
      next.push({ id: Number(tr.dataset.rowId), top: tr.offsetTop + tr.offsetHeight - 20 });
    });
    setPlaces(next);
  }, [wrapRef, anchorRef]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    wrap.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(wrap);
    const table = wrap.querySelector("table");
    if (table) ro.observe(table);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      wrap.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [wrapRef, measure, names]);

  if (!show) return null;
  const byId = new Map(names.map((n) => [n.id, n.name]));

  return (
    <div className="pointer-events-none absolute top-0 z-[1]" style={{ left, width }}>
      {places.map((p) => {
        const name = byId.get(p.id);
        if (!name) return null;
        return (
          <div
            key={p.id}
            className="absolute left-2 max-w-[calc(100%-1rem)] truncate rounded bg-card/90 px-1.5 text-[10px] leading-[14px] text-yellow-300"
            style={{ top: p.top }}
          >
            {name}
          </div>
        );
      })}
    </div>
  );
};

export default FloatingNames;