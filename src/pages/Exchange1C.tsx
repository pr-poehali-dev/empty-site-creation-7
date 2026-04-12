import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const EXCHANGE_URL = "https://functions.poehali.dev/6839fcc9-3788-4a5f-95af-8c1dcb80f890";

const Exchange1C = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState("");
  const [loadingKey, setLoadingKey] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ total: number } | null>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin");
      return;
    }
    fetchKey();
  }, []);

  const fetchKey = async () => {
    setLoadingKey(true);
    try {
      const resp = await fetch(`${EXCHANGE_URL}?action=get_key`, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) {
        setApiKey(data.key || "");
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить ключ", variant: "destructive" });
    } finally {
      setLoadingKey(false);
    }
  };

  const generateKey = async () => {
    setGeneratingKey(true);
    try {
      const resp = await fetch(`${EXCHANGE_URL}?action=set_key`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await resp.json();
      if (resp.ok) {
        setApiKey(data.key);
        toast({ title: "Ключ сгенерирован", description: "Скопируйте его в обработку 1С" });
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сгенерировать ключ", variant: "destructive" });
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    toast({ title: "Скопировано" });
  };

  const exportProducts = async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const resp = await fetch(`${EXCHANGE_URL}?action=products`, {
        headers: { "X-Api-Key": apiKey },
      });
      const data = await resp.json();
      if (resp.ok) {
        setExportResult({ total: data.total });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `products_export_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Выгрузка завершена", description: `Товаров: ${data.total}` });
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось выгрузить товары", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")}>
            <Icon name="ArrowLeft" size={20} />
          </Button>
          <h1 className="text-xl font-bold">Обмен с 1С</h1>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Icon name="Key" size={18} />
              API-ключ для 1С
            </h2>
            <p className="text-sm text-muted-foreground">
              Этот ключ нужно вставить в обработку 1С для авторизации обмена
            </p>
            <div className="flex gap-2">
              <Input
                value={loadingKey ? "Загрузка..." : apiKey || "Ключ не сгенерирован"}
                readOnly
                className="font-mono text-sm"
              />
              {apiKey && (
                <Button variant="outline" size="icon" onClick={copyKey} title="Копировать">
                  <Icon name="Copy" size={16} />
                </Button>
              )}
            </div>
            <Button onClick={generateKey} disabled={generatingKey} className="w-full">
              <Icon name="RefreshCw" size={16} />
              {generatingKey ? "Генерация..." : apiKey ? "Сгенерировать новый ключ" : "Сгенерировать ключ"}
            </Button>
            {apiKey && (
              <p className="text-xs text-yellow-400">
                При генерации нового ключа старый перестанет работать. Обновите ключ в обработке 1С.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Icon name="Download" size={18} />
              Выгрузить товары в 1С
            </h2>
            <p className="text-sm text-muted-foreground">
              Скачать JSON-файл со всеми товарами для загрузки в 1С
            </p>
            <Button
              onClick={exportProducts}
              disabled={exporting || !apiKey}
              variant="outline"
              className="w-full"
            >
              <Icon name="FileJson" size={16} />
              {exporting ? "Выгрузка..." : "Выгрузить товары"}
            </Button>
            {!apiKey && (
              <p className="text-xs text-muted-foreground">
                Сначала сгенерируйте API-ключ
              </p>
            )}
            {exportResult && (
              <p className="text-sm text-green-400">
                Выгружено товаров: {exportResult.total}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Icon name="Info" size={18} />
              URL для обработки 1С
            </h2>
            <p className="text-sm text-muted-foreground">
              Укажите этот адрес в настройках обработки 1С
            </p>
            <div className="flex gap-2">
              <Input value={EXCHANGE_URL} readOnly className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(EXCHANGE_URL);
                  toast({ title: "Скопировано" });
                }}
                title="Копировать"
              >
                <Icon name="Copy" size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Exchange1C;
