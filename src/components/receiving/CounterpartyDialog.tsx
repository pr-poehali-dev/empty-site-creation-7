import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import {
  archiveCounterparty,
  saveCounterparty,
  type Counterparty,
  type CounterpartyForm,
} from "@/lib/counterparties";

interface Props {
  row: Counterparty | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (row?: Counterparty) => void;
}

const toForm = (r: Counterparty | null): CounterpartyForm => ({
  id: r?.id,
  name: r?.name || "",
  inn: r?.inn || "",
  phone: r?.phone || "",
  contact: r?.contact || "",
  comment: r?.comment || "",
});

/** Карточка контрагента: просмотр, добавление и правка. */
const CounterpartyDialog = ({ row, canEdit, onClose, onSaved }: Props) => {
  const [form, setForm] = useState<CounterpartyForm>(() => toForm(row));
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<{ name: string; inn: string | null } | null>(null);

  const set = (k: keyof CounterpartyForm) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDup(null);
  };

  const innDigits = form.inn.replace(/\s/g, "");
  const innBad = innDigits !== "" && !/^(\d{10}|\d{12})$/.test(innDigits);

  const save = async (force = false) => {
    if (!form.name.trim() || innBad) return;
    setSaving(true);
    try {
      const r = await saveCounterparty(form, force);
      if (r.duplicate) {
        setDup(r.duplicate);
        return;
      }
      toast({ title: row ? "Сохранено" : "Контрагент добавлен" });
      onSaved(r.row);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await archiveCounterparty(row.id, !row.is_archived);
      toast({ title: row.is_archived ? "Возвращён из архива" : "Убран в архив" });
      onSaved();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const field = (
    k: keyof CounterpartyForm,
    label: string,
    opts: { placeholder?: string; mode?: "numeric" | "tel" } = {}
  ) => (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        value={String(form[k] ?? "")}
        onChange={(e) => set(k)(e.target.value)}
        placeholder={opts.placeholder}
        inputMode={opts.mode}
        disabled={!canEdit}
        className={`h-11 ${k === "inn" && innBad ? "border-rose-500/70" : ""}`}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-card border-t sm:border border-white/[0.1] sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-white/[0.08] px-4 py-3 flex items-center gap-2">
          <h2 className="flex-1 font-semibold truncate">
            {row ? (canEdit ? "Контрагент" : row.name) : "Новый контрагент"}
          </h2>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <Icon name="X" size={18} />
          </Button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {field("name", "Название *", { placeholder: "ООО «Ромашка» или Иванов И.И." })}
          {field("inn", "ИНН", { placeholder: "10 или 12 цифр", mode: "numeric" })}
          {innBad && <p className="text-xs text-rose-400 -mt-2">ИНН — 10 или 12 цифр</p>}
          {field("phone", "Телефон", { placeholder: "+7...", mode: "tel" })}
          {field("contact", "Контактное лицо")}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Комментарий</label>
            <Textarea
              value={form.comment}
              onChange={(e) => set("comment")(e.target.value)}
              disabled={!canEdit}
              rows={3}
            />
          </div>

          {row?.created_by_name && (
            <p className="text-xs text-muted-foreground">Добавил: {row.created_by_name}</p>
          )}

          {dup && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-3 space-y-2">
              <p className="text-sm text-amber-200 flex items-start gap-1.5">
                <Icon name="TriangleAlert" size={16} className="shrink-0 mt-0.5" />
                Похожий контрагент уже есть: {dup.name}
                {dup.inn ? `, ИНН ${dup.inn}` : ""}
              </p>
              <Button
                variant="outline"
                className="w-full h-10 border-amber-500/40 text-amber-200"
                disabled={saving}
                onClick={() => save(true)}
              >
                Это другой — всё равно сохранить
              </Button>
            </div>
          )}

          {canEdit && (
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full h-11"
                disabled={saving || !form.name.trim() || innBad || Boolean(dup)}
                onClick={() => save(false)}
              >
                {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : "Сохранить"}
              </Button>
              {row && (
                <Button
                  variant="ghost"
                  className="w-full h-10 text-muted-foreground"
                  disabled={saving}
                  onClick={toggleArchive}
                >
                  <Icon
                    name={row.is_archived ? "ArchiveRestore" : "Archive"}
                    size={15}
                    className="mr-1.5"
                  />
                  {row.is_archived ? "Вернуть из архива" : "Убрать в архив"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CounterpartyDialog;
