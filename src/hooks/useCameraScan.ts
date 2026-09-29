import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const PREFIX = "receiving_scan_";

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
