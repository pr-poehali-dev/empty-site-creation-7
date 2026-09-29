import { useCallback, useRef, useState } from "react";

const KEY = "scanner_torch_on";

type TorchCaps = { torch?: boolean };

/**
 * Фонарик камеры. Помним последнее состояние на этом телефоне: выключили
 * сканер с горящим — в следующий раз загорится сам. Фонарик гаснет вместе
 * с остановкой камеры, отдельно гасить при выходе не нужно.
 * На iPhone сайтам фонарик недоступен — тогда available остаётся false.
 */
export function useTorch() {
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);

  const apply = async (track: MediaStreamTrack, value: boolean) => {
    await track.applyConstraints({ advanced: [{ torch: value } as MediaTrackConstraintSet] });
  };

  /** Вызывать сразу после открытия камеры. */
  const attach = useCallback(async (track: MediaStreamTrack | undefined | null) => {
    trackRef.current = track || null;
    setOn(false);
    const caps = (track?.getCapabilities?.() || {}) as TorchCaps;
    if (!track || !caps.torch) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    if (localStorage.getItem(KEY) === "1") {
      try {
        await apply(track, true);
        setOn(true);
      } catch {
        /* не загорелся — кнопка останется, можно нажать руками */
      }
    }
  }, []);

  /** Камеру закрыли — фонарик погас вместе с ней, запомненное не трогаем. */
  const detach = useCallback(() => {
    trackRef.current = null;
    setAvailable(false);
    setOn(false);
  }, []);

  const toggle = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !on;
    try {
      await apply(track, next);
      setOn(next);
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      setAvailable(false);
    }
  }, [on]);

  return { available, on, attach, detach, toggle };
}
