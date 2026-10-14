import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { findBatch } from "@/lib/batches";

const PUBLIC_URL = "https://functions.poehali.dev/ad95d622-b1b8-4205-87ec-c22a51ebf206";

interface PublicBatch {
  number: string;
  status: string;
  status_title: string;
  warehouse: string;
  mixed: boolean;
  date: string;
  closed_at: string | null;
  total: number;
  items: { name: string; qty: number; parts: { warehouse: string; qty: number }[] }[];
}

const day = (s: string) => new Date(s).toLocaleDateString("ru-RU");

/** Открытая страница партии из ссылки или QR. Сотрудник с доступом попадает в карточку партии. */
const BatchPublic = () => {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PublicBatch | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const showPublic = () =>
      fetch(`${PUBLIC_URL}?key=${encodeURIComponent(key)}`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Партия не найдена");
          if (alive) setData(d);
        })
        .catch((e) => alive && setError((e as Error).message));

    if (localStorage.getItem("auth_token")) {
      findBatch(`/b/${key}`)
        .then((r) => {
          if (!alive) return;
          if (r.found && r.id) navigate(`/admin/receiving-batches/${r.id}`, { replace: true });
          else showPublic();
        })
        .catch(() => showPublic());
    } else {
      showPublic();
    }
    return () => {
      alive = false;
    };
  }, [key, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50 text-neutral-900">
        <div className="text-center">
          <Icon name="PackageX" size={36} className="mx-auto mb-3 text-neutral-400" fallback="Package" />
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Icon name="Loader2" size={28} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  const ended = data.status !== "done";

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <header className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Партия</div>
          <h1 className="text-2xl font-bold break-all">{data.number}</h1>
          <div className="text-sm text-neutral-600">
            {day(data.date)} · {data.warehouse} · {data.total} шт.
          </div>
        </header>

        {ended && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {data.status_title}
            {data.closed_at ? ` ${day(data.closed_at)}` : ""}
          </div>
        )}

        {data.items.length > 0 && (
          <div className="rounded-2xl bg-white shadow-sm border border-neutral-200 divide-y divide-neutral-100">
            {data.items.map((it) => (
              <div key={it.name} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="flex-1 break-words">{it.name}</span>
                  <span className="font-semibold shrink-0">{it.qty} шт.</span>
                </div>
                {it.parts.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 pl-3 border-l-2 border-neutral-200">
                    {it.parts.map((p) => (
                      <div key={p.warehouse} className="flex text-sm text-neutral-600">
                        <span className="flex-1">{p.warehouse}</span>
                        <span>{p.qty} шт.</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchPublic;
