import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { Group1C } from "@/pages/odata/nomenApi";
import {
  ExcelRow,
  buildNomenExcel,
  downloadBase64,
  nomenFileName,
  saveToYuraFiles,
} from "@/pages/odata/nomenExcel";

interface Props {
  rows: ExcelRow[];
  groups: Group1C[];
  invoiceName: string;
  pendingDecisions: number;
}

const NomenExcelPanel = ({ rows, groups, invoiceName, pendingDecisions }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ count: number; name: string } | null>(null);

  const make = async () => {
    const b64 = buildNomenExcel(rows, groups);
    const name = nomenFileName(invoiceName);
    downloadBase64(b64, name);
    setSaving(true);
    try {
      await saveToYuraFiles(
        b64,
        name,
        `Новая номенклатура: ${rows.length} поз.`,
        `Создано в 1С Трейд Ресурс по счёту ${invoiceName}. Для загрузки в другие базы: FIFO, НДС 22% и «Без НДС».`,
      );
      setSaved({ count: rows.length, name });
    } catch (e) {
      toast({ title: "Файл скачан, но в «Файлы от Юры» не сохранён", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const stale = saved && saved.count !== rows.length;

  return (
    <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
      <div className="font-semibold flex items-center gap-2">
        <Icon name="FileSpreadsheet" size={18} className="text-primary" />
        5. Excel для других баз
      </div>
      <p className="text-xs text-muted-foreground">
        Только карточки, созданные сейчас в 1С: все реквизиты, способ списания FIFO, ставки НДС 22% и «Без
        НДС», базовая цена. Файл скачается и сохранится в «Файлы от Юры».
      </p>
      {pendingDecisions > 0 && (
        <p className="text-xs text-amber-400">
          Ещё не решено по {pendingDecisions} позициям — если какие-то создадите, сделайте файл заново.
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={make} disabled={!rows.length || saving}>
          <Icon name={saving ? "Loader2" : "Download"} size={16} className={saving ? "animate-spin" : ""} />
          {saved ? "Сделать заново" : "Скачать Excel"} ({rows.length})
        </Button>
        {saved && (
          <Button variant="outline" onClick={() => navigate("/admin/converted-files")}>
            <Icon name="FolderOpen" size={16} />
            Файлы от Юры
          </Button>
        )}
      </div>
      {saved && !stale && (
        <div className="text-xs text-emerald-400">
          Сохранён «{saved.name}» — {saved.count} позиций.
        </div>
      )}
      {stale && (
        <div className="text-xs text-amber-400">
          С момента сохранения созданных карточек стало {rows.length} — сделайте файл заново.
        </div>
      )}
    </section>
  );
};

export default NomenExcelPanel;
