import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { RECIPES } from "@/components/owner/proxyRecipes";

const SETTINGS_URL = "https://functions.poehali.dev/82a95791-7a9f-4f40-8167-eb96c3045d34";

const ProxyGuide = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { platform } = useParams();
  const token = localStorage.getItem("auth_token") || "";
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");

  const recipe = RECIPES.find((r) => r.id === platform) || null;

  const [proxyKey, setProxyKey] = useState("");
  const [proxies, setProxies] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin");
      return;
    }
    fetch(SETTINGS_URL, { headers: { "X-Authorization": `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setProxyKey(d.tg_proxy_key || "");
        const raw = (d.tg_proxies || "") as string;
        setProxies(raw.split(",").map((s) => s.trim()).filter(Boolean));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [token]);

  const save = async (key: string, value: string) => {
    try {
      const resp = await fetch(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}` },
        body: JSON.stringify({ key, value }),
      });
      if (!resp.ok) {
        const d = await resp.json();
        toast({ title: "Ошибка", description: d.error, variant: "destructive" });
        return false;
      }
      return true;
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
      return false;
    }
  };

  const genKey = async () => {
    if (proxyKey && !confirm("Старый ключ перестанет работать. Новый нужно будет вписать в код посредника. Продолжить?")) return;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const prev = proxyKey;
    setProxyKey(key);
    if (await save("tg_proxy_key", key)) {
      toast({ title: "Ключ создан", description: "Он уже вставлен в код ниже" });
    } else {
      setProxyKey(prev);
    }
  };

  const copyCode = async () => {
    if (!recipe) return;
    try {
      await navigator.clipboard.writeText(recipe.code(proxyKey));
      toast({ title: "Код скопирован" });
    } catch {
      toast({ title: "Не удалось скопировать", description: "Выделите код вручную", variant: "destructive" });
    }
  };

  const addProxy = async () => {
    const v = url.trim().replace(/\/+$/, "");
    if (!v) return;
    if (!/^https?:\/\//.test(v)) {
      toast({ title: "Неверный адрес", description: "Адрес должен начинаться с https://", variant: "destructive" });
      return;
    }
    if (proxies.includes(v)) {
      toast({ title: "Этот адрес уже в списке" });
      return;
    }
    const list = [...proxies, v];
    setProxies(list);
    if (await save("tg_proxies", list.join(","))) {
      toast({ title: "Посредник добавлен", description: "Проверьте связь в настройках" });
      navigate("/admin/settings?tab=telegram");
    } else {
      setProxies(proxies);
    }
  };

  const back = () => navigate("/admin/settings?tab=telegram");

  if (!recipe) {
    return (
      <div className="min-h-screen">
        <main className="max-w-3xl mx-auto px-4 py-10 text-center space-y-4">
          <p className="text-muted-foreground">Такой инструкции нет.</p>
          <Button onClick={back}>Вернуться в настройки</Button>
        </main>
      </div>
    );
  }

  const code = recipe.code(proxyKey || "СНАЧАЛА_СГЕНЕРИРУЙТЕ_КЛЮЧ");
  const p = recipe.price;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={back}>
            <Icon name="ArrowLeft" size={16} />
          </Button>
          <Icon name={recipe.icon} size={20} className="text-primary shrink-0" />
          <h1 className="text-lg sm:text-xl font-semibold truncate">{recipe.name}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-5">
        {loading ? (
          <p className="text-muted-foreground">Загрузка...</p>
        ) : (
          <>
            <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-2">
              <p className="text-sm font-medium">Сколько это стоит</p>
              <dl className="text-sm space-y-1.5">
                {[
                  ["Цена", p.cost],
                  ["Карта", p.card],
                  ["Бесплатный лимит", p.limit],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col sm:flex-row gap-0.5 sm:gap-2">
                    <dt className="text-muted-foreground sm:w-40 shrink-0">{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-muted-foreground pt-1">{p.enough}</p>
              {p.catch && (
                <div className="flex items-start gap-2 pt-1">
                  <Icon name="TriangleAlert" size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-200/90">{p.catch}</p>
                </div>
              )}
            </div>

            {!proxyKey && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                <p className="text-sm text-amber-200/90">
                  Сначала нужен ключ — без него код работать не будет.
                </p>
                <Button size="sm" onClick={genKey}>
                  <Icon name="Key" size={14} className="mr-1.5" />
                  Сгенерировать ключ
                </Button>
              </div>
            )}

            <ol className="space-y-4">
              {recipe.steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-sm font-medium flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5 break-words">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">Код — {recipe.fileName}</p>
                <Button variant="outline" size="sm" onClick={copyCode} disabled={!proxyKey} className="shrink-0">
                  <Icon name="Copy" size={14} className="mr-1.5" />
                  Скопировать
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-black/40 border border-white/[0.06] text-xs leading-relaxed overflow-x-auto max-w-full">
                <code className="block whitespace-pre">{code}</code>
              </pre>
              {proxyKey && (
                <p className="text-sm text-muted-foreground">
                  Ключ уже внутри — править ничего не нужно.
                </p>
              )}
            </div>

            <div className="space-y-2 pt-4 border-t border-white/[0.06]">
              <p className="text-sm font-medium">Адрес посредника</p>
              <p className="text-sm text-muted-foreground break-words">
                Вставьте то, что выдала площадка. Например: {recipe.urlHint}
              </p>
              <div className="flex gap-2">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addProxy()}
                  placeholder="https://..."
                  className="text-sm"
                />
                <Button onClick={addProxy} disabled={!url.trim()} className="shrink-0">
                  <Icon name="Plus" size={16} />
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ProxyGuide;
