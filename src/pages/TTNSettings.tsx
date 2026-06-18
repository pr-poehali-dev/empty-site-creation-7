import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const TTN_URL = "https://functions.poehali.dev/ca436342-bff6-4616-96c6-d0470df5c242";

interface TTNFile {
  id: number;
  filename: string;
  cdn_url: string;
  uploaded_at: string;
}

const TTNSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = localStorage.getItem("auth_token") || "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<TTNFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(TTN_URL, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setFiles(data.files || []);
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить список", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);

      const resp = await fetch(TTN_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ filename: file.name, file: b64 }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Файл загружен", description: file.name });
        fetchFiles();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить файл", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate("/admin/ttn")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg sm:text-xl font-semibold">Настройки создания ТТН</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        <div className="rounded-xl border border-white/[0.08] bg-card p-5 sm:p-6">
          <h2 className="font-semibold mb-1">Загрузка Excel-файла</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Загрузите образец ТТН в формате .xlsx. Файл сохранится здесь, и его можно будет скачать
            для анализа и создания шаблона.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            className="h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Icon name="Loader2" size={18} className="animate-spin" />
            ) : (
              <Icon name="Upload" size={18} />
            )}
            {uploading ? "Загрузка…" : "Загрузить .xlsx"}
          </Button>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-card p-5 sm:p-6">
          <h2 className="font-semibold mb-4">Загруженные файлы</h2>
          {loading ? (
            <div className="flex justify-center py-6">
              <Icon name="Loader2" size={22} className="animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Пока нет загруженных файлов</p>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon name="FileSpreadsheet" size={20} className="text-green-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{f.filename}</p>
                      <p className="text-xs text-muted-foreground">{f.uploaded_at.slice(0, 16).replace("T", " ")}</p>
                    </div>
                  </div>
                  <a href={f.cdn_url} download target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm" className="h-8 gap-2 hover:bg-white/[0.06]">
                      <Icon name="Download" size={16} />
                      <span className="hidden sm:inline">Скачать</span>
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default TTNSettings;
