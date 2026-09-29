import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const PREFIX = "receiving_scan_";
const SNAP_PREFIX = "receiving_scan_snap_";

/** Запомнить фильтры экрана перед уходом на камеру. */
export const saveScanSnapshot = (fieldKey: string, data: unknown) => {
  sessionStorage.setItem(SNAP_PREFIX + fieldKey, JSON.stringify(data));
};

/**
 * Фильтры, запомненные перед уходом на камеру. Читать при создании экрана
 * (в начальном состоянии) — запись стирается при первом показе экрана.
 */
export const useScanSnapshot = <T>(fieldKey: string): Partial<T> => {
  const key = SNAP_PREFIX + fieldKey;
  const [snap] = useState<Partial<T>>(() => {
    const raw = sessionStorage.getItem(key);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Partial<T>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    sessionStorage.removeItem(key);
  }, [key]);
  return snap;
};

/**
 * Сканер камерой в режиме «один код»: открывает /admin/scan и при возврате
 * отдаёт прочитанный код. Каждое поле — со своим ключом, чтобы коды не путались.
 */
export const useCameraScan = (fieldKey: string, onCode: (code: string) => void) => {
  const navigate = useNavigate();
  const location = useLocation();
  const storageKey = PREFIX + fieldKey;
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    const code = localStorage.getItem(storageKey);
    if (!code) return;
    localStorage.removeItem(storageKey);
    onCodeRef.current(code);
  }, [storageKey]);

  return useCallback(() => {
    const returnTo = location.pathname + location.search;
    navigate(
      `/admin/scan?mode=single&key=${encodeURIComponent(storageKey)}&returnTo=${encodeURIComponent(returnTo)}`
    );
  }, [navigate, location.pathname, location.search, storageKey]);
};