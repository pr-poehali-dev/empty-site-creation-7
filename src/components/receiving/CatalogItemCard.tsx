import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import { permHeaders } from "@/hooks/useReceivingPerms";
import {
  RECEIVING_CATALOG_URL,
  FIELD_TITLES,
  GROUP_FIELDS,
  TECH_COLUMNS,
  cellText,
  priceLabel,
  type CatalogMeta,
  type GroupRow,
  type ItemRow,
} from "@/lib/receivingCatalog";

const PAGE = 100;

interface Props {
  row: GroupRow;
  meta: CatalogMeta;
  onClose: () => void;
  onChanged: () => void;
}

const CatalogItemCard = ({ row, meta, onClose, onChanged }: Props) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const cols = TECH_COLUMNS.filter((f) => meta.visible.includes(f));

  const load = useCallback(
    async (offset: number) => {
      const r = await fetch(RECEIVING_CATALOG_URL, {
        method: "POST",
        headers: permHeaders(),
        body: JSON.stringify({
          action: "group_items",
          product_group: row.product_group,
          brand: row.brand,
          model: row.model,
          limit: PAGE,
          offset,
        }),
      });
      const d = await r.json();
      setRows((prev) => (offset === 0 ? d.rows || [] : [...prev, ...(d.rows || [])]));
      setTotal(d.total || 0);
      setLoading(false);
    },
    [row.product_group, row.brand, row.model],
  );

  useEffect(() => {
    setLoading(true);
    load(0);
  }, [load]);

  const saveGroup = async (field: string, value: string) => {
    const r = await fetch(RECEIVING_CATALOG_URL, {
      method: "POST",
      headers: permHeaders(),
      body: JSON.stringify({
        action: "update_group",
        product_group: row.product_group,
        brand: row.brand,
        model: row.model,
        field,
        value,
      }),
    });
    if (!r.ok) {
      toast({ title: "Не удалось сохранить", variant: "destructive" });
      return;
    }
    const d = await r.json();
    toast({ title: `Изменено строк: ${d.updated}` });
    setEditKey(null);
    onChanged();
    onClose();
  };

  const saveItem = async (id: number, field: string, value: string) => {
    const r = await fetch(RECEIVING_CATALOG_URL, {
      method: "POST",
      headers: permHeaders(),
      body: JSON.stringify({ action: "update_item", id, field, value }),
    });
    if (!r.ok) {
      toast({ title: "Не удалось сохранить", variant: "destructive" });
      return;
    }
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
    setEditKey(null);
    onChanged();
  };

  const groupEditable = GROUP_FIELDS.filter((f) => meta.editable.includes(f));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-white/[0.08] shrink-0">
          <DialogTitle className="text-base leading-tight pr-8">{row.name}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {total} шт
            {meta.visible.includes("price") && priceLabel(row) ? ` · ${priceLabel(row)} ₽` : ""}
          </p>
        </DialogHeader>

        {groupEditable.length > 0 && (
          <div className="px-5 py-3 border-b border-white/[0.08] shrink-0 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Правка всей позиции
            </div>
            <div className="flex flex-wrap gap-2">
              {groupEditable.map((f) => {
                const key = `g:${f}`;
                const current =
                  f === "price" ? "" : String((row as unknown as Record<string, unknown>)[f] ?? "");
                if (editKey === key) {
                  return (
                    <div key={f} className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveGroup(f, draft)}
                        className="h-8 w-44 text-sm"
                        placeholder={FIELD_TITLES[f]}
                      />
                      <Button size="sm" className="h-8 px-2" onClick={() => saveGroup(f, draft)}>
                        <Icon name="Check" size={15} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => setEditKey(null)}
                      >
                        <Icon name="X" size={15} />
                      </Button>
                    </div>
                  );
                }
                return (
                  <Button
                    key={f}
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      setEditKey(key);
                      setDraft(current);
                    }}
                  >
                    <Icon name="Pencil" size={13} className="mr-1.5" />
                    {FIELD_TITLES[f]}
                  </Button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Изменение применится ко всем {total} строкам позиции
            </p>
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 py-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Загружаю...</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs text-muted-foreground">
                  {cols.map((f) => (
                    <th key={f} className="py-2 pr-3 font-normal whitespace-nowrap">
                      {FIELD_TITLES[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => (
                  <tr key={it.id} className="border-t border-white/[0.06]">
                    {cols.map((f) => {
                      const key = `i:${it.id}:${f}`;
                      const canEdit = meta.editable.includes(f) && !GROUP_FIELDS.includes(f);
                      if (editKey === key) {
                        return (
                          <td key={f} className="py-1 pr-3">
                            <Input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => saveItem(it.id, f, draft)}
                              onKeyDown={(e) => e.key === "Enter" && saveItem(it.id, f, draft)}
                              className="h-7 text-sm"
                            />
                          </td>
                        );
                      }
                      return (
                        <td
                          key={f}
                          className={`py-2 pr-3 align-top ${canEdit ? "cursor-pointer hover:text-violet-300" : ""}`}
                          onClick={() => {
                            if (!canEdit) return;
                            setEditKey(key);
                            setDraft(String(it[f] ?? ""));
                          }}
                        >
                          {cellText(f, it[f])}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && rows.length < total && (
            <Button variant="outline" className="w-full mt-3" onClick={() => load(rows.length)}>
              Показать ещё
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CatalogItemCard;
