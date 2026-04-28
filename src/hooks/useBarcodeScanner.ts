import { useEffect, useRef, useState } from "react";

interface UseBarcodeScannerOptions {
  enabled: boolean;
  onScan: (barcode: string) => void;
  minSpeed?: number;
  terminators?: string[];
  ignoreInputs?: boolean;
  minLength?: number;
}

export function useBarcodeScanner({
  enabled,
  onScan,
  minSpeed = 30,
  terminators = ["Enter", "Tab"],
  ignoreInputs = true,
  minLength = 4,
}: UseBarcodeScannerOptions) {
  const [isActive, setIsActive] = useState(false);
  const bufferRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      setIsActive(false);
      return;
    }
    setIsActive(true);

    const handler = (e: KeyboardEvent) => {
      if (ignoreInputs) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target?.isContentEditable
        ) {
          return;
        }
      }

      const now = Date.now();
      const delta = now - lastTimeRef.current;

      if (terminators.includes(e.key)) {
        const code = bufferRef.current.trim();
        bufferRef.current = "";
        lastTimeRef.current = 0;
        if (code.length >= minLength) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length !== 1) {
        return;
      }

      if (delta > 200 && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }

      if (bufferRef.current.length > 0 && delta > minSpeed * 3) {
        bufferRef.current = "";
      }

      bufferRef.current += e.key;
      lastTimeRef.current = now;
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      setIsActive(false);
    };
  }, [enabled, minSpeed, ignoreInputs, terminators.join(",")]);

  return { isActive };
}

export default useBarcodeScanner;
