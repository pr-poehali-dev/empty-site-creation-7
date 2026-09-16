import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const FILES_URL = "https://functions.poehali.dev/fadb6c3a-c3a7-4774-8ca7-f5cc8f53b3e1";

interface ConvertedFile {
  id: number;
  title: string;
  description: string;
  file_url: string;
  file_name: string;
  size_bytes: number;
  created_at: string;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-white/[0.08] bg-card p-4">
    <h2 className="font-semibold text-sm mb-2">{title}</h2>
    <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">{children}</div>
  </div>
);

const Manual = () => (
  <div className="space-y-3">
    <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
      <p className="text-sm">
        Эта вкладка — памятка для Юры. Когда владелец пишет «зайди на страницу
        Конвертация файлов и прочти инструкцию» — Юра читает текст ниже, затем просит
        у владельца файл и спрашивает, что с ним нужно сделать.
      </p>
    </div>

    <Section title="Зачем эта страница">
      <p>
        Владелец присылает файл в чат и словами описывает, что с ним сделать. Юра
        обрабатывает файл и выкладывает результат в этот список. Владелец скачивает
        готовый файл отсюда в любой момент и с любого устройства, а ненужное удаляет
        сам.
      </p>
      <p>
        Формат любой: таблицы Excel и CSV, документы Word и PDF, текстовые файлы,
        картинки, архивы. Ограничение только одно — задача должна быть выполнима
        обработкой файла, а не ручным трудом.
      </p>
    </Section>

    <Section title="Что делать Юре">
      <p>1. Прочитать эту инструкцию целиком, включая раздел с правилами.</p>
      <p>2. Попросить у владельца файл и уточнить задачу, если она не описана.</p>
      <p>
        3. Спросить, как назвать готовый файл. Имя НЕ придумывать самому. Если владелец
        не ответил или сказал «как было» — сохранить исходное имя присланного файла без
        изменений: не добавлять даты, наценки и прочие пометки.
      </p>
      <p>
        4. Если задача совпадает с готовым правилом ниже — применить его, не
        переспрашивая условия заново.
      </p>
      <p>
        5. Обработать файл через Bash, сохранить результат в папку{" "}
        <code className="text-xs bg-white/[0.06] px-1 rounded">public/converted/</code>,
        затем добавить запись в таблицу{" "}
        <code className="text-xs bg-white/[0.06] px-1 rounded">converted_files</code>{" "}
        миграцией. После этого файл появится в списке.
      </p>
      <p>
        6. Если появилось новое повторяющееся правило обработки — дописать его в раздел
        ниже, чтобы владельцу не пришлось объяснять дважды.
      </p>
    </Section>

    <Section title="Где что лежит">
      <p>
        Страница:{" "}
        <code className="text-xs bg-white/[0.06] px-1 rounded">src/pages/ConvertedFiles.tsx</code>
      </p>
      <p>
        Функция:{" "}
        <code className="text-xs bg-white/[0.06] px-1 rounded">backend/converted-files</code>{" "}
        — список, загрузка, удаление. Доступ только для роли owner.
      </p>
      <p>
        Таблица:{" "}
        <code className="text-xs bg-white/[0.06] px-1 rounded">converted_files</code>{" "}
        — название, описание, ссылка на файл, имя файла, ключ хранилища, размер, дата.
      </p>
      <p>
        В поле описания стоит коротко указывать, что именно сделано с файлом — владелец
        видит это в списке.
      </p>
    </Section>

    <Section title="Готовые правила обработки">
      <div className="rounded-lg border border-white/[0.08] p-3">
        <p className="font-medium text-foreground text-sm mb-1">Наценка 10%</p>
        <p>Исходник: таблица из четырёх колонок — артикул, наименование, серийный номер, цена.</p>
        <p>Колонки 1, 2 и 3 не менять.</p>
        <p>Цену умножить на 1.1 и округлить всегда вверх до целого рубля.</p>
        <p>Служебные строки под таблицей товаров убрать полностью.</p>
        <p>Внизу колонки цены — строка «ИТОГО» с суммой по новым ценам.</p>
      </div>
      <p className="text-xs pt-1">
        Новые правила Юра дописывает сюда сам, как только задача повторяется во второй
        раз.
      </p>
    </Section>
  </div>
);

const ConvertedFiles = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = localStorage.getItem("auth_token") || "";

  const [files, setFiles] = useState<ConvertedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ConvertedFile | null>(null);
  const [tab, setTab] = useState<"files" | "manual">("files");
  const [editTarget, setEditTarget] = useState<ConvertedFile | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";

  useEffect(() => {
    if (!isOwner) navigate("/admin/dashboard");
  }, [isOwner, navigate]);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(FILES_URL, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setFiles(data.files || []);
      else toast({ title: "Ошибка", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить список", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const resp = await fetch(`${FILES_URL}?id=${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (resp.ok) {
        toast({ title: "Файл удалён" });
        setDeleteTarget(null);
        fetchFiles();
      } else {
        const data = await resp.json();
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" });
    }
  };

  const openEdit = (f: ConvertedFile) => {
    setEditTarget(f);
    setEditTitle(f.title);
    setEditName(f.file_name);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const resp = await fetch(`${FILES_URL}?id=${editTarget.id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ title: editTitle, file_name: editName }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast({ title: "Название изменено" });
        setEditTarget(null);
        fetchFiles();
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => navigate("/admin/dashboard")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Конвертация файлов</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex gap-2 mb-4">
          <button
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "files"
                ? "bg-primary/20 text-primary"
                : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
            }`}
            onClick={() => setTab("files")}
          >
            <Icon name="Files" size={14} className="inline mr-1" />
            Файлы
          </button>
          <button
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "manual"
                ? "bg-primary/20 text-primary"
                : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
            }`}
            onClick={() => setTab("manual")}
          >
            <Icon name="BookOpen" size={14} className="inline mr-1" />
            Инструкция
          </button>
        </div>

        {tab === "manual" ? (
          <Manual />
        ) : (
          <>
        <div className="mb-4 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
          <p className="text-sm text-muted-foreground">
            Пришлите файл в чат разработчику и опишите, что с ним сделать. Обработанный
            файл появится в этом списке под тем же именем, если не попросите другое.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="FileSpreadsheet" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Пока нет обработанных файлов</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-white/[0.08] bg-card p-3 sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon name="FileSpreadsheet" size={18} className="text-green-400 flex-shrink-0" />
                      <p className="font-medium text-sm sm:text-base truncate">{f.title}</p>
                    </div>
                    {f.description && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        {f.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(f.created_at)}
                      {f.size_bytes ? ` · ${formatSize(f.size_bytes)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={f.file_url}
                      download={f.file_name}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                    >
                      <Icon name="Download" size={16} />
                    </a>
                    <button
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                      onClick={() => openEdit(f)}
                    >
                      <Icon name="Pencil" size={16} />
                    </button>
                    <button
                      className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-destructive/20 transition-colors"
                      onClick={() => setDeleteTarget(f)}
                    >
                      <Icon name="Trash2" size={16} className="text-destructive" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </main>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <DialogHeader>
            <DialogTitle>Переименовать</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Название в списке</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Имя файла при скачивании</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Расширение подставится само, если его убрать
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setEditTarget(null)}>
              Отмена
            </Button>
            <Button className="rounded-xl" onClick={saveEdit} disabled={saving}>
              {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent className="rounded-2xl border-white/[0.08] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить файл?</AlertDialogTitle>
            <AlertDialogDescription>
              Файл «{deleteTarget?.title}» будет удалён безвозвратно. Это действие нельзя
              отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConvertedFiles;