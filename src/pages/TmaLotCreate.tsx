import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";

const LOTS_URL = "https://functions.poehali.dev/ccf1033f-bcff-4801-a6dc-8597eec21344";

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
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

const TmaLotCreate = () => {
  const navigate = useNavigate();
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

  useEffect(() => {
    const tg = getTg();
    if (tg) {
      tg.ready();
      tg.expand();
      setInitData(tg.initData || "");
    }
  }, []);

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
          action: "create",
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
        <h1 className="text-xl font-bold">Новый лот</h1>
      </div>

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
              <label className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 cursor-pointer text-sm">
                <Icon name="Camera" size={18} />
                Сделать фото
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => addPhotos(e.target.files)}
                />
              </label>
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
          {saving ? "Сохранение…" : "Опубликовать лот"}
        </button>
      </div>

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