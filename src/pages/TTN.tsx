import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const GOODS_PARSER_URL = "https://functions.poehali.dev/a65f6707-5393-4aaa-932a-f956f2d28318";

const TTN = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => reject(new Error("Не удалось прочитать файл в браузере"));
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setRows([]);
    setStatus(null);
    setFileName(file.name);
    try {
      const b64 = await fileToBase64(file);

      const resp = await fetch(GOODS_PARSER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, file: b64 }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setRows(data.rows || []);
        setStatus({ type: "ok", text: `Файл разобран. Найдено строк: ${data.row_count}` });
        toast({ title: "Файл разобран", description: `Найдено строк: ${data.row_count}` });
      } else {
        setStatus({ type: "error", text: data.error || `Ошибка сервера (${resp.status})` });
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ type: "error", text: msg });
      toast({ title: "Ошибка", description: msg, variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-white/[0.06]"
              onClick={() => navigate("/admin/dashboard")}
            >
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg sm:text-xl font-semibold">Создание ТТН</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-white/[0.08] gap-2"
            onClick={() => navigate("/admin/ttn/settings")}
          >
            <Icon name="Settings" size={16} />
            <span className="hidden sm:inline">Настройки создания ТТН</span>
            <span className="sm:hidden">Настройки</span>
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        <div className="rounded-xl border border-white/[0.08] bg-card p-5 sm:p-6">
          <h2 className="font-semibold mb-1">Файл с товарами</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Загрузите присланный файл с товарами (.xlsx или .docx). Данные подтянутся в таблицу ТТН.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.docx"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            className="h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? (
              <Icon name="Loader2" size={18} className="animate-spin" />
            ) : (
              <Icon name="Upload" size={18} />
            )}
            {parsing ? "Разбор…" : "Загрузить файл с товарами"}
          </Button>
          {parsing && (
            <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2">
              <Icon name="Loader2" size={14} className="animate-spin" />
              Идёт разбор файла «{fileName}»…
            </p>
          )}
          {!parsing && status && (
            <div
              className={`text-sm mt-3 flex items-start gap-2 rounded-lg px-3 py-2 ${
                status.type === "ok"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              <Icon
                name={status.type === "ok" ? "CircleCheck" : "CircleAlert"}
                size={16}
                className="mt-0.5 shrink-0"
              />
              <span>
                {fileName && <span className="opacity-70">{fileName}: </span>}
                {status.text}
              </span>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-5 sm:p-6">
            <h2 className="font-semibold mb-4">Распознанные строки ({rows.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-white/[0.06]">
                      <td className="py-2 pr-3 text-muted-foreground text-xs w-8">{i + 1}</td>
                      {Array.from({ length: maxCols }).map((_, j) => (
                        <td key={j} className="py-2 px-3 align-top">
                          {r[j] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TTN;