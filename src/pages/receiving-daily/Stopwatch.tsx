import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { fmtDuration } from "./dailyApi";

export const STOPWATCH_KEY = "receiving_stopwatch";

export const stopwatchOn = () => localStorage.getItem(STOPWATCH_KEY) === "1";

interface Props {
  /** Момент взятия единицы в работу (мс). */
  since: number;
}

/** Таймер по единице: до 5 минут зелёный, до 10 жёлтый, дальше красный. */
const Stopwatch = ({ since }: Props) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sec = Math.max(0, Math.floor((now - since) / 1000));
  const tone =
    sec < 300
      ? "bg-emerald-500 text-emerald-950"
      : sec < 600
        ? "bg-amber-400 text-amber-950"
        : "bg-rose-500 text-white";
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  return (
    <div
      className={`fixed top-2 left-1/2 -translate-x-1/2 z-[70] rounded-full px-4 py-1.5 shadow-lg flex items-center gap-1.5 font-semibold tabular-nums ${tone}`}
      title={fmtDuration(sec)}
    >
      <Icon name="Timer" size={16} />
      {mm}:{ss}
    </div>
  );
};

export default Stopwatch;
