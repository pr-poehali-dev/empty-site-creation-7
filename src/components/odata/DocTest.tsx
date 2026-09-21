import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import TestCard from "./TestCard";
import ResultBox from "./ResultBox";
import { odataApi, CreatedObject } from "@/pages/odata/odataApi";

interface DocTestProps {
  base: string;
  kind: string;
  title: string;
  icon: string;
  organizationKey?: string;
  warehouseKey?: string;
  isProduct?: boolean;
}

const DocTest = ({
  base,
  kind,
  title,
  icon,
  organizationKey,
  warehouseKey,
  isProduct,
}: DocTestProps) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreatedObject | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [confirmHard, setConfirmHard] = useState(false);

  const create = async () => {
    setBusy(true);
    setRemoved(null);
    setConfirmHard(false);
    try {
      const r = isProduct
        ? await odataApi.createProduct(base)
        : await odataApi.createDoc(base, kind, organizationKey, warehouseKey);
      setResult(r.result);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (hard: boolean) => {
    if (!result?.entity || !result?.key) return;
    setBusy(true);
    try {
      const r = await odataApi.remove(base, result.entity, result.key, hard);
      if (r.result.ok) {
        setRemoved(hard ? "Удалён из базы полностью" : "Помечен на удаление");
        if (hard) setResult(null);
      } else {
        setRemoved(`Не удалось: ${r.result.error}`);
      }
    } catch (e) {
      setRemoved(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
      setConfirmHard(false);
    }
  };

  const created = result?.ok;

  return (
    <TestCard
      title={title}
      icon={icon}
      description={isProduct ? "Создаёт тестовый товар в справочнике" : "Создаёт пустой непроведённый документ"}
    >
      <Button onClick={create} disabled={busy} size="sm" className="rounded-lg gap-2">
        {busy ? (
          <Icon name="Loader2" size={15} className="animate-spin" />
        ) : (
          <Icon name="Plus" size={15} />
        )}
        Создать
      </Button>

      {result && !result.ok && (
        <ResultBox ok={false} title="1С отказала" details={result.error} sent={result.sent} />
      )}

      {created && (
        <>
          <ResultBox
            ok
            title={isProduct ? "Товар создан" : "Документ создан"}
            details={[
              result.number ? `Номер: ${result.number}` : null,
              result.name ? `Название: ${result.name}` : null,
              result.date ? `Дата: ${result.date.replace("T", " ")}` : null,
              !isProduct ? `Проведён: ${result.posted ? "да" : "нет"}` : null,
              `Идентификатор: ${result.key}`,
            ]
              .filter(Boolean)
              .join("\n")}
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              onClick={() => remove(false)}
              disabled={busy}
              size="sm"
              variant="outline"
              className="rounded-lg gap-2"
            >
              <Icon name="Flag" size={15} />
              Пометить на удаление
            </Button>
            {confirmHard ? (
              <>
                <Button
                  onClick={() => remove(true)}
                  disabled={busy}
                  size="sm"
                  variant="destructive"
                  className="rounded-lg gap-2"
                >
                  <Icon name="Trash2" size={15} />
                  Точно удалить
                </Button>
                <Button
                  onClick={() => setConfirmHard(false)}
                  size="sm"
                  variant="ghost"
                  className="rounded-lg"
                >
                  Отмена
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setConfirmHard(true)}
                disabled={busy}
                size="sm"
                variant="outline"
                className="rounded-lg gap-2 border-red-500/30 text-red-300 hover:bg-red-500/10"
              >
                <Icon name="Trash2" size={15} />
                Удалить совсем
              </Button>
            )}
          </div>
        </>
      )}

      {removed && (
        <div className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
          <Icon name="Info" size={14} />
          {removed}
        </div>
      )}
    </TestCard>
  );
};

export default DocTest;
