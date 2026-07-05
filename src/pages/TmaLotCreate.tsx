import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "@/components/ui/icon";

const LOTS_URL = "https://functions.poehali.dev/ccf1033f-bcff-4801-a6dc-8597eec21344";

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  showAlert?: (msg: string) => void;
}

const getTg = (): TgWebApp | undefined =>
  (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const defaultEndsAt = () => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const isoToLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const TmaLotCreate = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(Boolean(id));
  const [initData, setInitData] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [endsAt, setEndsAt] = useState(defaultEndsAt());
  const [paymentMin, setPaymentMin] = useState("60");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const start = () => {
      const tg = getTg();
      if (!tg) return;
      tg.ready();
      tg.expand();
      const data = tg.initData || "";
      setInitData(data);
      if (isEdit && data) loadLot(data);
    };
    const tg = getTg();
    if (tg) {
      start();
    } else {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.async = true;
      script.onload = start;
      document.body.appendChild(script);
    }
     
  }, []);

  const loadLot = async (data: string) => {
    try {
      const resp = await fetch(`${LOTS_URL}?lot_id=${id}&init_data=${encodeURIComponent(data)}`);
      const res = await resp.json();
      if (!resp.ok || !res.lot) {
        setError(res.error || "Не удалось загрузить лот");
        setLoading(false);
        return;
      }
      const lot = res.lot;
      setTitle(lot.title || "");
      setDescription(lot.description || "");
      setPrice(String(lot.desired_price || ""));
      setQuantity(String(lot.quantity || 1));
      if (lot.ends_at) setEndsAt(isoToLocalInput(lot.ends_at));
      setPaymentMin(String(lot.payment_deadline_minutes || 60));
      setPhotos(lot.photo_urls || []);
    } catch {
      setError("Ошибка соединения.");
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const openCamera = async () => {
    if (photos.length >= 5) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      fallbackInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      fallbackInputRef.current?.click();
    }
  };

  const takeShot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPhotos((prev) => [...prev, dataUrl].slice(0, 5));
    stopCamera();
  };

  useEffect(() => () => stopCamera(), []);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = 5 - photos.length;
    const list = Array.from(files).slice(0, room);
    const encoded = await Promise.all(list.map(fileToDataUrl));
    setPhotos((prev) => [...prev, ...encoded].slice(0, 5));
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setError("");
    if (!title.trim()) return setError("Укажите название лота");
    if (!price || Number(price) <= 0) return setError("Укажите цену больше нуля");
    if (!endsAt) return setError("Укажите срок окончания");

    setSaving(true);
    try {
      const resp = await fetch(LOTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: initData,
          action: isEdit ? "update" : "create",
          lot_id: id ? Number(id) : undefined,
          title: title.trim(),
          description: description.trim(),
          desired_price: Number(price),
          quantity: Number(quantity) || 1,
          ends_at: new Date(endsAt).toISOString(),
          payment_deadline_minutes: Number(paymentMin) || 60,
          photos,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Не удалось сохранить лот");
        setSaving(false);
        return;
      }
      navigate("/tma/cabinet");
    } catch {
      setError("Ошибка соединения. Попробуйте позже.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-6 flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/tma/cabinet")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <h1 className="text-xl font-bold">{isEdit ? "Редактирование лота" : "Новый лот"}</h1>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Icon name="Loader2" size={28} className="animate-spin opacity-70" />
          <p className="text-muted-foreground text-sm">Загрузка…</p>
        </div>
      )}
      {!loading && (

      <div className="flex flex-col gap-4 max-w-md w-full mx-auto">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Фото (до 5, первое — обложка)</label>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-border">
                <img src={p} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-lg bg-black/60"
                >
                  <Icon name="X" size={14} className="text-white" />
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    Обложка
                  </span>
                )}
              </div>
            ))}
          </div>
          {photos.length < 5 && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={openCamera}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-sm"
              >
                <Icon name="Camera" size={18} />
                Сделать фото
              </button>
              <input
                ref={fallbackInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => addPhotos(e.target.files)}
              />
              <label className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 cursor-pointer text-sm">
                <Icon name="Image" size={18} />
                Из галереи
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addPhotos(e.target.files)}
                />
              </label>
            </div>
          )}
        </div>

        <Field label="Название">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: iPhone 15 Pro 256Gb"
            className="tma-input"
          />
        </Field>

        <Field label="Описание">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Состояние, комплект, детали"
            className="tma-input resize-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Желаемая цена, ₽">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              className="tma-input"
            />
          </Field>
          <Field label="Количество">
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="1"
              className="tma-input"
            />
          </Field>
        </div>

        <Field label="Окончание аукциона">
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="tma-input"
          />
        </Field>

        <Field label="Срок оплаты для победителя, мин">
          <input
            value={paymentMin}
            onChange={(e) => setPaymentMin(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="60"
            className="tma-input"
          />
        </Field>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={submit}
          disabled={saving}
          className="mt-2 w-full rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <Icon name="Loader2" size={18} className="animate-spin" />}
          {saving ? "Сохранение…" : isEdit ? "Сохранить изменения" : "Создать лот"}
        </button>
      </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <video
            ref={videoRef}
            playsInline
            muted
            className="flex-1 w-full object-cover"
          />
          <div className="flex items-center justify-between px-8 py-6 bg-black">
            <button
              onClick={stopCamera}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <Icon name="X" size={22} />
            </button>
            <button
              onClick={takeShot}
              className="h-16 w-16 rounded-full border-4 border-white bg-white/20"
            />
            <div className="h-12 w-12" />
          </div>
        </div>
      )}

      <style>{`
        .tma-input {
          width: 100%;
          border-radius: 0.9rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          color: hsl(var(--foreground));
          padding: 0.75rem 1rem;
          font-size: 0.95rem;
          outline: none;
        }
        .tma-input:focus { border-color: hsl(var(--primary)); }
      `}</style>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-sm text-muted-foreground mb-2 block">{label}</label>
    {children}
  </div>
);

export default TmaLotCreate;