import { useCallback, useState } from "react";

const PREFIX = "similar_codes_open_";

/**
 * Окно «Похожие коды» для конкретного места. Код, по которому открыто окно,
 * живёт в памяти вкладки: ушли на камеру за этикеткой поставщика — вернулись,
 * и окно открылось снова с тем же кодом.
 */
export const useSimilarCodes = (place: string) => {
  const key = PREFIX + place;
  const [code, setCode] = useState<string | null>(() => sessionStorage.getItem(key));

  const open = useCallback(
    (c: string) => {
      sessionStorage.setItem(key, c);
      setCode(c);
    },
    [key]
  );

  const close = useCallback(() => {
    sessionStorage.removeItem(key);
    setCode(null);
  }, [key]);

  return { code, open, close };
};
