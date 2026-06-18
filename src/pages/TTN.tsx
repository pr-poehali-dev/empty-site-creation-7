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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setRows([]);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);

      const resp = await fetch(GOODS_PARSER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, file: b64 }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setRows(data.rows || []);
        toast({ title: "Файл разобран", description: `Найдено строк: ${data.row_count}` });
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось разобрать файл", variant: "destructive" });
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
          {fileName && !parsing && (
            <p className="text-xs text-muted-foreground mt-3">
              <Icon name="FileCheck" size={14} className="inline mr-1" />
              {fileName}
            </p>
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
