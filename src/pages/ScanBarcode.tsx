import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

const MAX_VISIBLE = 5;
const PRODUCTS_URL = "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const PRICING_URL = "https://functions.poehali.dev/8b1df5ee-7914-4801-aa0f-3bd851bdb4a0";
const NEW_BARCODES_URL = "https://functions.poehali.dev/753c16bb-172a-460b-a7b4-2ffc3c26b6f7";
const TEMP_PRODUCTS_URL = "https://functions.poehali.dev/ff99d086-44a7-4bda-9977-abd1d352fb63";

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) => Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
}

interface ScannedItem {
  id: number;
  barcode: string;
  name: string | null;
  found: boolean;
  product_id: number | null;
  price: number;
}

interface PricingRule {
  filter_type: string;
  filter_value: string;
  price_field: string;
  formula: string;
}

interface CollectedEntry {
  barcode: string;
  product_id: number | null;
  name: string | null;
  price: number;
}

const getDetectorCtor = (): BarcodeDetectorConstructor | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
};

const ScanBarcode = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/admin/catalog";
  const storageKey = searchParams.get("key") || "scanned_barcodes";
  const wholesalerIdParam = searchParams.get("wholesalerId");

  const pricingRulesRef = useRef<PricingRule[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const idCounterRef = useRef<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"initializing" | "scanning" | "unsupported">("initializing");
  const [flashCapture, setFlashCapture] = useState(false);
  const [flashError, setFlashError] = useState(false);
  const [collected, setCollected] = useState<CollectedEntry[]>([]);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [lastFlash, setLastFlash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchItem, setSearchItem] = useState<ScannedItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"all" | "article">("all");
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; article: string | null; brand: string | null; price_wholesale?: number | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [saveBarcodeDialog, setSaveBarcodeDialog] = useState<{ barcode: string; productId: number; productName: string } | null>(null);
  const [tempResults, setTempResults] = useState<{ id: number; brand: string; article: string; price: number }[]>([]);
  const [showTempForm, setShowTempForm] = useState(false);
  const [tempBrand, setTempBrand] = useState("");
  const [tempArticle, setTempArticle] = useState("");
  const [tempQty, setTempQty] = useState("1");
  const [tempPrice, setTempPrice] = useState("");
  const [savingTemp, setSavingTemp] = useState(false);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [showBrandList, setShowBrandList] = useState(false);
  const [articleSuggestions, setArticleSuggestions] = useState<{ id: number; name: string; article: string | null; brand: string | null }[]>([]);
  const [showArticleList, setShowArticleList] = useState(false);
  const articleDebounceRef2 = useRef<ReturnType<typeof setTimeout>>();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const token = localStorage.getItem("auth_token") || "";
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const calcPrice = (product: Record<string, unknown>): number => {
    const rules = pricingRulesRef.current;
    const group = product.product_group as string | null;
    let matched: PricingRule | null = null;
    for (const r of rules) {
      if (r.filter_type === "product_group" && group === r.filter_value) matched = r;
    }
    if (!matched) return parseFloat(String(product.price_wholesale || 0));
    const priceMap: Record<string, number> = {
      price_base: parseFloat(String(product.price_base || 0)),
      price_retail: parseFloat(String(product.price_retail || 0)),
      price_wholesale: parseFloat(String(product.price_wholesale || 0)),
      price_purchase: parseFloat(String(product.price_purchase || 0)),
    };
    let result = priceMap[matched.price_field] || 0;
    const regex = /([+\-*/])\s*([\d.]+)/g;
    let m;
    while ((m = regex.exec(matched.formula)) !== null) {
      const v = parseFloat(m[2]) || 0;
      if (m[1] === "*") result *= v;
      else if (m[1] === "/") result = v ? result / v : 0;
      else if (m[1] === "+") result += v;
      else if (m[1] === "-") result -= v;
    }
    return Math.round(result * 100) / 100;
  };

  useEffect(() => {
    if (!wholesalerIdParam) return;
    fetch(`${PRICING_URL}?wholesaler_id=${wholesalerIdParam}`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => { pricingRulesRef.current = data.items || []; })
      .catch(() => {});
  }, [wholesalerIdParam]);

  const saveCollected = (next: CollectedEntry[]) => {
    setCollected(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const resolveBarcode = async (id: number, code: string): Promise<ScannedItem> => {
    try {
      const resp = await fetch(`${PRODUCTS_URL}?barcode=${encodeURIComponent(code)}`, {
        headers: authHeaders,
      });
      const data = await resp.json();
      const found = resp.ok && data.items?.length > 0 ? data.items[0] : data.item || null;
      if (found) {
        const price = found.is_temp ? (found.price_wholesale || 0) : calcPrice(found);
        return { id, barcode: code, name: found.name, found: true, product_id: found.is_temp ? null : found.id, price };
      }
    } catch { /* ignore */ }
    return { id, barcode: code, name: null, found: false, product_id: null, price: 0 };
  };

  const processScan = async (code: string) => {
    if (navigator.vibrate) navigator.vibrate(100);
    setLastFlash(code);
    setTimeout(() => setLastFlash(null), 1200);

    const id = ++idCounterRef.current;
    const item = await resolveBarcode(id, code);

    const entry: CollectedEntry = { barcode: code, product_id: item.product_id, name: item.name, price: item.price };
    setCollected((prev) => {
      const next = [...prev, entry];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });

    setScannedItems((prev) => [item, ...prev].slice(0, MAX_VISIBLE));
  };

  const applyAutoSettings = async (track: MediaStreamTrack) => {
    try {
      const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
      const advanced: MediaTrackConstraintSet[] = [];
      const focusModes = (caps.focusMode as string[] | undefined) || [];
      if (focusModes.includes("continuous")) {
        advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
      }
      const exposureModes = (caps.exposureMode as string[] | undefined) || [];
      if (exposureModes.includes("continuous")) {
        advanced.push({ exposureMode: "continuous" } as MediaTrackConstraintSet);
      }
      const wbModes = (caps.whiteBalanceMode as string[] | undefined) || [];
      if (wbModes.includes("continuous")) {
        advanced.push({ whiteBalanceMode: "continuous" } as MediaTrackConstraintSet);
      }
      if (advanced.length > 0) {
        await track.applyConstraints({ advanced });
      }
    } catch (e) {
      console.warn("applyAutoSettings failed:", e);
    }
  };

  const pickBackCamera = async (): Promise<string | undefined> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      const back = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
      return back?.deviceId;
    } catch {
      return undefined;
    }
  };

  const showError = (msg: string) => {
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    setErrorMsg(msg);
    setFlashError(true);
    setTimeout(() => setFlashError(false), 300);
    setTimeout(() => setErrorMsg(null), 1500);
  };

  const takePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;
    setFlashCapture(true);
    setTimeout(() => setFlashCapture(false), 150);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        showError("Ошибка камеры");
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const results = await detectorRef.current.detect(canvas);
      if (results && results.length > 0) {
        processScan(results[0].rawValue);
      } else {
        showError("Штрихкод не распознан");
      }
    } catch (e) {
      console.warn("photo scan error:", e);
      showError("Ошибка распознавания");
    }
  };

  const goBack = () => {
    navigate(returnTo);
  };

  const removeItem = (id: number, barcode: string) => {
    setScannedItems((prev) => prev.filter((s) => s.id !== id));
    setCollected((prev) => {
      const idx = prev.findIndex((e) => e.barcode === barcode);
      if (idx === -1) return prev;
      const next = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const openSearch = (item: ScannedItem) => {
    setSearchItem(item);
    setSearchQuery("");
    setSearchResults([]);
    setSearchMode("all");
  };

  const doSearch = useCallback(async (query: string, mode: "all" | "article") => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setTempResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: query, search_type: mode, per_page: "10" });
      const [prodResp, tempResp] = await Promise.all([
        fetch(`${PRODUCTS_URL}?${params}`, { headers: authHeaders }),
        fetch(`${TEMP_PRODUCTS_URL}?search=${encodeURIComponent(query)}&per_page=5`, { headers: authHeaders }),
      ]);
      const prodData = await prodResp.json();
      const tempData = await tempResp.json();
      if (prodResp.ok) setSearchResults(prodData.items || []);
      if (tempResp.ok) setTempResults(tempData.items || []);
    } catch { /* ignore */ }
    setSearching(false);
  }, [token]);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => doSearch(value, searchMode), 300);
  };

  const selectProduct = (product: { id: number; name: string; price_wholesale?: number | null }) => {
    if (!searchItem) return;
    const barcode = searchItem.barcode;
    const price = calcPrice(product as Record<string, unknown>);
    setScannedItems((prev) =>
      prev.map((s) => s.id === searchItem.id ? { ...s, name: product.name, found: true, product_id: product.id, price } : s)
    );
    setCollected((prev) => {
      const idx = prev.findIndex((e) => e.barcode === barcode && !e.product_id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], product_id: product.id, name: product.name, price };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
    setSearchItem(null);
    setSaveBarcodeDialog({ barcode, productId: product.id, productName: product.name });
  };

  const selectTempProduct = (tp: { id: number; brand: string; article: string; price: number }) => {
    if (!searchItem) return;
    const barcode = searchItem.barcode;
    const name = `${tp.brand} ${tp.article}`;
    const price = tp.price || 0;
    setScannedItems((prev) =>
      prev.map((s) => s.id === searchItem.id ? { ...s, name, found: true, product_id: null, price } : s)
    );
    setCollected((prev) => {
      const idx = prev.findIndex((e) => e.barcode === barcode && !e.product_id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], product_id: null, name, price };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
    setSearchItem(null);
    fetch(TEMP_PRODUCTS_URL + `?id=${tp.id}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ barcode }),
    }).catch(() => {});
    fetch(NEW_BARCODES_URL, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ barcode, nomenclature_id: null, save_to_product: false }),
    }).catch(() => {});
  };

  const saveTempAndSelect = async () => {
    if (!searchItem || !tempBrand.trim() || !tempArticle.trim()) return;
    setSavingTemp(true);
    try {
      const resp = await fetch(TEMP_PRODUCTS_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          brand: tempBrand.trim(),
          article: tempArticle.trim(),
          quantity: parseFloat(tempQty) || 1,
          price: parseFloat(tempPrice) || 0,
          barcode: searchItem.barcode,
        }),
      });
      if (resp.ok) {
        const barcode = searchItem.barcode;
        const name = `${tempBrand.trim()} ${tempArticle.trim()}`;
        const price = parseFloat(tempPrice) || 0;
        setScannedItems((prev) =>
          prev.map((s) => s.id === searchItem.id ? { ...s, name, found: true, product_id: null, price } : s)
        );
        setCollected((prev) => {
          const idx = prev.findIndex((e) => e.barcode === barcode && !e.product_id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], product_id: null, name, price };
          localStorage.setItem(storageKey, JSON.stringify(next));
          return next;
        });
        setSearchItem(null);
        setShowTempForm(false);
        setTempBrand(""); setTempArticle(""); setTempQty("1"); setTempPrice("");
        fetch(NEW_BARCODES_URL, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ barcode, nomenclature_id: null, save_to_product: false }),
        }).catch(() => {});
      }
    } catch { /* ignore */ }
    setSavingTemp(false);
  };

  const saveNewBarcode = async (save: boolean) => {
    if (!saveBarcodeDialog) return;
    try {
      await fetch(NEW_BARCODES_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          barcode: saveBarcodeDialog.barcode,
          nomenclature_id: saveBarcodeDialog.productId,
          save_to_product: save,
        }),
      });
    } catch { /* ignore */ }
    setSaveBarcodeDialog(null);
  };

  useEffect(() => {
    Promise.all([
      fetch(`${PRODUCTS_URL}?search=&per_page=200`, { headers: authHeaders }).then(r => r.json()),
      fetch(`${TEMP_PRODUCTS_URL}?per_page=200`, { headers: authHeaders }).then(r => r.json()),
    ]).then(([prodData, tempData]) => {
      const prodBrands = (prodData.items || []).map((p: { brand: string | null }) => p.brand).filter(Boolean);
      const tempBrands = (tempData.items || []).map((p: { brand: string }) => p.brand).filter(Boolean);
      setAllBrands([...new Set<string>([...prodBrands, ...tempBrands])].sort() as string[]);
    }).catch(() => {});
  }, []);

  const searchArticlesInScan = (value: string) => {
    setTempArticle(value);
    if (articleDebounceRef2.current) clearTimeout(articleDebounceRef2.current);
    if (!value.trim() || value.trim().length < 2) { setArticleSuggestions([]); return; }
    articleDebounceRef2.current = setTimeout(async () => {
      try {
        const [prodResp, tempResp] = await Promise.all([
          fetch(`${PRODUCTS_URL}?search=${encodeURIComponent(value)}&search_type=article&per_page=8`, { headers: authHeaders }),
          fetch(`${TEMP_PRODUCTS_URL}?search=${encodeURIComponent(value)}&per_page=5`, { headers: authHeaders }),
        ]);
        const prodData = await prodResp.json();
        const tempData = await tempResp.json();
        const prodItems = prodResp.ok ? (prodData.items || []) : [];
        const tempItems = tempResp.ok ? (tempData.items || []).map((t: { id: number; brand: string; article: string }) => ({ id: t.id, name: `${t.brand} ${t.article}`, article: t.article, brand: t.brand })) : [];
        setArticleSuggestions([...tempItems, ...prodItems]);
      } catch { /* ignore */ }
    }, 300);
  };

  const filteredBrands = allBrands.filter(b => b.toLowerCase().includes(tempBrand.toLowerCase()));

  useEffect(() => {
    const DetectorCtor = getDetectorCtor();

    if (!DetectorCtor) {
      setStatus("unsupported");
      return;
    }

    const start = async () => {
      try {
        const backDeviceId = await pickBackCamera();
        const videoConstraints: MediaTrackConstraints = backDeviceId
          ? {
              deviceId: { exact: backDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track) await applyAutoSettings(track);

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("video.play error:", playErr);
        }

        let supportedFormats: string[] = [];
        try {
          supportedFormats = (await DetectorCtor.getSupportedFormats?.()) || [];
        } catch { /* ignore */ }

        const desired = [
          "ean_13", "ean_8", "upc_a", "upc_e",
          "code_128", "code_39", "code_93", "itf",
          "qr_code", "data_matrix",
        ].filter((f) => supportedFormats.length === 0 || supportedFormats.includes(f));

        detectorRef.current = new DetectorCtor({ formats: desired });
        setStatus("scanning");
      } catch (err) {
        console.error("Scanner start error:", err);
        const errStr = String(err);
        if (errStr.includes("NotAllowedError") || errStr.includes("Permission")) {
          setError("Доступ к камере запрещён. Разрешите в настройках браузера.");
        } else if (errStr.includes("NotReadableError")) {
          setError("Камера занята другим приложением");
        } else {
          setError(`Ошибка камеры: ${errStr.slice(0, 100)}`);
        }
      }
    };

    start();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-white hover:bg-white/20"
          onClick={goBack}
        >
          <Icon name="ArrowLeft" size={18} />
          <span className="ml-1">Назад</span>
        </Button>
        <p className="text-white text-sm font-medium">Сканирование</p>
        <Button
          size="sm"
          className="h-9"
          onClick={goBack}
        >
          <Icon name="Check" size={16} />
          <span className="ml-1">Готово{collected.length > 0 ? ` (${collected.length})` : ""}</span>
        </Button>
      </div>

      {status === "unsupported" ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <Icon name="AlertTriangle" size={48} className="text-yellow-400 mx-auto mb-3" />
            <p className="text-white text-sm mb-2">
              Сканирование не поддерживается в этом браузере.
            </p>
            <p className="text-white/60 text-xs mb-5">
              Используйте Chrome, Edge или Samsung Internet на Android.
            </p>
            <Button variant="outline" className="rounded-xl border-white/20 text-white" onClick={goBack}>
              Вернуться
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden" style={{ height: "40%" }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas ref={canvasRef} className="hidden" />

            {flashCapture && <div className="absolute inset-0 bg-white/60 pointer-events-none" />}

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[80%] max-w-xs h-20 relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-orange-500 rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-orange-500 rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-orange-500 rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-orange-500 rounded-br-2xl" />
              </div>
            </div>

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-6">
                <div className="text-center">
                  <Icon name="CameraOff" size={48} className="text-red-400 mx-auto mb-3" />
                  <p className="text-white text-sm">{error}</p>
                  <Button
                    variant="outline"
                    className="mt-4 rounded-xl border-white/20 text-white"
                    onClick={goBack}
                  >
                    Вернуться
                  </Button>
                </div>
              </div>
            )}

            {lastFlash && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-green-500/90 text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 z-10">
                <Icon name="Check" size={14} />
                {lastFlash}
              </div>
            )}

            {errorMsg && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 z-10">
                <Icon name="AlertCircle" size={14} />
                {errorMsg}
              </div>
            )}

            {flashError && <div className="absolute inset-0 bg-red-500/40 pointer-events-none" />}
          </div>

          <div className="flex-1 bg-black/95 flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-white/10 flex-shrink-0">
              <p className="text-white/50 text-xs font-medium">
                {collected.length > 0
                  ? `Распознано: ${collected.length}`
                  : "Наведите на штрихкод и нажмите «Сканировать»"}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {scannedItems.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Icon name="ScanBarcode" size={32} className="text-white/20 mx-auto mb-2" />
                    <p className="text-white/30 text-xs">Поддерживается: Chrome, Edge, Samsung Internet</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {scannedItems.map((item, i) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                        !item.found
                          ? "bg-orange-500/25 border border-orange-500/40 cursor-pointer"
                          : i === 0
                            ? "bg-green-500/15"
                            : "bg-white/[0.04]"
                      }`}
                      onClick={!item.found ? () => openSearch(item) : undefined}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        item.found ? "bg-green-500/20" : "bg-orange-500/30"
                      }`}>
                        <Icon
                          name={item.found ? "Package" : "AlertCircle"}
                          size={14}
                          className={item.found ? "text-green-400" : "text-orange-400"}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${item.found ? "text-white" : "text-orange-300"}`}>
                          {item.found ? item.name : "Нажмите, чтобы найти товар"}
                        </p>
                        <p className="text-[10px] text-white/30">{item.barcode}</p>
                      </div>
                      {item.found && item.price > 0 && (
                        <span className="text-xs text-green-400 font-medium flex-shrink-0">{item.price.toLocaleString()} ₽</span>
                      )}
                      <button
                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeItem(item.id, item.barcode); }}
                      >
                        <Icon name="X" size={12} className="text-white/40" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {status === "scanning" && !error && (
              <button
                className="w-full h-12 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold flex items-center justify-center gap-2 transition-colors flex-shrink-0"
                onClick={takePhoto}
              >
                <Icon name="ScanBarcode" size={20} />
                Сканировать
              </button>
            )}
          </div>
        </>
      )}

      {saveBarcodeDialog && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-card rounded-2xl border border-white/[0.08] p-5 max-w-sm w-full">
            <p className="text-sm font-medium mb-1">Записать штрихкод?</p>
            <p className="text-xs text-muted-foreground mb-4">
              Записать штрихкод <span className="font-mono text-white">{saveBarcodeDialog.barcode}</span> в карточку товара «{saveBarcodeDialog.productName}»?
            </p>
            <div className="flex gap-2">
              <Button className="flex-1 rounded-xl" onClick={() => saveNewBarcode(true)}>
                Да, записать
              </Button>
              <Button variant="outline" className="rounded-xl border-white/[0.08]" onClick={() => saveNewBarcode(false)}>
                Нет
              </Button>
            </div>
          </div>
        </div>
      )}

      {searchItem && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <button className="text-white/60 text-sm" onClick={() => setSearchItem(null)}>
              <Icon name="ArrowLeft" size={18} />
            </button>
            <p className="text-white text-sm font-medium truncate mx-3">
              Найти товар для {searchItem.barcode}
            </p>
            <div className="w-[18px]" />
          </div>

          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <div className="flex gap-1.5 mb-2">
              <button
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  searchMode === "all" ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-white/50"
                }`}
                onClick={() => { setSearchMode("all"); if (searchQuery.trim()) doSearch(searchQuery, "all"); }}
              >
                Все поля
              </button>
              <button
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  searchMode === "article" ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-white/50"
                }`}
                onClick={() => { setSearchMode("article"); if (searchQuery.trim()) doSearch(searchQuery, "article"); }}
              >
                Артикул
              </button>
            </div>
            <div className="relative">
              <Input
                placeholder={searchMode === "article" ? "Введите артикул..." : "Название, артикул, бренд..."}
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="h-10 rounded-xl bg-white/[0.08] border-white/[0.12] text-white text-sm pr-8"
                autoFocus
              />
              {searching && (
                <Icon name="Loader2" size={14} className="absolute right-3 top-3 animate-spin text-white/40" />
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {showTempForm ? (
              <div className="p-3 rounded-xl border border-red-500/30 bg-red-950/20">
                <p className="text-xs text-red-400 mb-2 font-medium">Новый товар</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="relative">
                    <Input placeholder="Бренд *" value={tempBrand} onChange={(e) => { setTempBrand(e.target.value); setShowBrandList(true); }} onFocus={() => setShowBrandList(true)} onBlur={() => setTimeout(() => setShowBrandList(false), 200)} className="h-9 rounded-lg bg-white/[0.08] border-white/[0.12] text-white text-sm" />
                    {showBrandList && filteredBrands.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-card overflow-hidden max-h-40 overflow-y-auto shadow-lg">
                        {filteredBrands.slice(0, 15).map((b) => (
                          <button key={b} className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0" onMouseDown={(e) => { e.preventDefault(); setTempBrand(b); setShowBrandList(false); }}>{b}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <Input placeholder="Артикул *" value={tempArticle} onChange={(e) => { searchArticlesInScan(e.target.value); setShowArticleList(true); }} onFocus={() => setShowArticleList(true)} onBlur={() => setTimeout(() => setShowArticleList(false), 200)} className="h-9 rounded-lg bg-white/[0.08] border-white/[0.12] text-white text-sm" />
                    {showArticleList && articleSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-card overflow-hidden max-h-40 overflow-y-auto shadow-lg">
                        {articleSuggestions.map((item) => (
                          <button key={item.id} className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0" onMouseDown={(e) => { e.preventDefault(); selectProduct(item); setShowTempForm(false); setTempBrand(""); setTempArticle(""); setShowArticleList(false); }}>
                            <span className="block">{item.article}</span>
                            <span className="text-xs text-muted-foreground">{item.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Input placeholder="Кол-во" type="number" value={tempQty} onChange={(e) => setTempQty(e.target.value)} className="h-9 rounded-lg bg-white/[0.08] border-white/[0.12] text-white text-sm" />
                  <Input placeholder="Цена" type="number" value={tempPrice} onChange={(e) => setTempPrice(e.target.value)} className="h-9 rounded-lg bg-white/[0.08] border-white/[0.12] text-white text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-lg flex-1" onClick={saveTempAndSelect} disabled={savingTemp || !tempBrand.trim() || !tempArticle.trim()}>
                    {savingTemp ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
                    <span className="ml-1">Добавить</span>
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-white/50" onClick={() => setShowTempForm(false)}>Отмена</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {tempResults.map((tp) => (
                    <button
                      key={`tp-${tp.id}`}
                      className="w-full text-left px-3 py-2.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 transition-colors"
                      onClick={() => selectTempProduct(tp)}
                    >
                      <p className="text-white text-sm truncate">{tp.brand} {tp.article}</p>
                      <p className="text-amber-400 text-xs flex items-center gap-1">
                        <Icon name="AlertTriangle" size={10} /> временный · {tp.price ? `${tp.price.toLocaleString()} ₽` : "—"}
                      </p>
                    </button>
                  ))}
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                      onClick={() => selectProduct(p)}
                    >
                      <p className="text-white text-sm truncate">{p.name}</p>
                      <p className="text-white/40 text-xs">
                        {p.article && p.article}
                        {p.article && p.brand && " · "}
                        {p.brand || ""}
                      </p>
                    </button>
                  ))}
                </div>
                {searchResults.length === 0 && tempResults.length === 0 && searchQuery.trim().length >= 2 && !searching && (
                  <p className="text-white/30 text-xs text-center mt-4 mb-2">Ничего не найдено</p>
                )}
                <button
                  className="w-full text-left px-3 py-2.5 rounded-xl mt-2 text-amber-400 text-sm flex items-center gap-2 hover:bg-white/[0.04] transition-colors"
                  onClick={() => setShowTempForm(true)}
                >
                  <Icon name="PlusCircle" size={14} />
                  Товара нет в каталоге — добавь артикул и бренд
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanBarcode;