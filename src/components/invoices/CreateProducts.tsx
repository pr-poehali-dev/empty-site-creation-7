import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import PickList from "@/components/search-dicts/PickList";
import { authHeaders, SEARCH_DICTS_URL } from "@/components/search-dicts/api";

interface Parsed {
  brand: string | null;
  brand_implied?: boolean;
  group: string | null;
  model: string | null;
  feature: string | null;
}

interface Dup {
  reason: string;
  id: number;
  name: string;
}

interface Item {
  key: string;
  row_indexes: number[];
  name: string;
  article: string;
  barcode: string;
  qty: number;
  brand_id: number | null;
  parsed: Parsed;
  duplicates: Dup[];
  other_features?: string[];
}

interface Folder {
  name: string;
  products: number;
}

type ArtMode = "model" | "empty";

interface Edit {
  on: boolean;
  folder: string | null;
  art: ArtMode | null;
}

interface Props {
  draftId: number;
  onBack: () => void;
  onDone: () => void;
}

const CreateProducts = ({ draftId, onBack, onDone }: Props) => {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState("");
  const [artMode, setArtMode] = useState<ArtMode>("model");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${SEARCH_DICTS_URL}?section=create&draft_id=${draftId}`, { headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setItems(d.items || []);
        setFolders(d.folders || []);
        setFolder(d.default_folder || "");
        const e: Record<string, Edit> = {};
        (d.items as Item[]).forEach((it) => {
          e[it.key] = { on: it.duplicates.length === 0, folder: null, art: null };
        });
        setEdits(e);
      } catch (err) {
        toast({ title: (err as Error).message || "Не удалось загрузить", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [draftId, toast]);

  const patch = (k: string, p: Partial<Edit>) => setEdits((prev) => ({ ...prev, [k]: { ...prev[k], ...p } }));

  const resolve = (it: Item) => {
    const e = edits[it.key] || { on: true, folder: null, art: null };
    const f = e.folder ?? folder;
    const mode = e.art ?? artMode;
    const article = it.article || (mode === "model" ? it.parsed.model || "" : "");
    return { e, folder: f, article, mode };
  };

  const selected = items.filter((it) => edits[it.key]?.on);
  const noFolder = selected.some((it) => !resolve(it).folder);
  const folderOptions = folders.map((f) => ({ value: f.name, label: f.name, count: f.products }));

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((it) => it.name.toLowerCase().includes(s)) : items;
  }, [items, q]);

  const allOn = items.length > 0 && selected.length === items.length;

  const submit = async () => {
    setSaving(true);
    try {
      const payload = selected.map((it) => {
        const r = resolve(it);
        return {
          row_indexes: it.row_indexes, name: it.name, article: r.article, barcode: it.barcode,
          brand_id: it.brand_id, parsed: it.parsed, folder: r.folder,
        };
      });
      const resp = await fetch(`${SEARCH_DICTS_URL}?section=create`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ draft_id: draftId, items: payload }),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      toast({ title: `Создано товаров: ${d.created}` });
      onDone();
    } catch (err) {
      toast({ title: (err as Error).message || "Не удалось создать", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <Icon name="ArrowLeft" size={20} />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Эти товары будут созданы</h2>
          <p className="text-sm text-muted-foreground">
            Проверьте список — так не будет дублей ни на сайте, ни в 1С
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Icon name="Loader" size={24} className="animate-spin mx-auto mb-2" />
          Готовлю список
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">Нет строк для создания</div>
      ) : (
        <>
          <div className="rounded-xl border border-white/[0.08] p-3 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Папка для всех товаров</p>
              <div className="w-full sm:w-72">
                <PickList value={folder} onChange={setFolder} placeholder="Выберите папку" options={folderOptions} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Если в счёте нет артикула</p>
              <div className="inline-flex rounded-xl border border-white/[0.08] p-0.5 bg-secondary">
                {(["model", "empty"] as ArtMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setArtMode(m)}
                    className={`px-3 h-8 rounded-lg text-sm transition-colors ${artMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {m === "model" ? "Модель в артикул" : "Оставить пустым"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Единица «шт», НДС «Без НДС», списание FIFO, категория «Без категории». Цены — на следующем шаге.
              Все товары получат пометку «Не выгружен в 1С».
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={allOn}
                onChange={() => {
                  const v = !allOn;
                  setEdits((prev) => Object.fromEntries(Object.entries(prev).map(([k, e]) => [k, { ...e, on: v }])));
                }}
                className="w-4 h-4 accent-primary"
              />
              Выбрано {selected.length} из {items.length}
            </label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по списку"
              className="w-full sm:w-56 rounded-xl ml-auto"
            />
          </div>

          <div className="space-y-2 pb-24">
            {visible.map((it) => {
              const r = resolve(it);
              const p = it.parsed;
              return (
                <div
                  key={it.key}
                  className={`rounded-xl border p-3 transition-opacity ${it.duplicates.length ? "border-amber-500/40 bg-amber-500/[0.05]" : "border-white/[0.08]"} ${r.e.on ? "" : "opacity-50"}`}
                >
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.e.on}
                      onChange={() => patch(it.key, { on: !r.e.on })}
                      className="w-4 h-4 mt-0.5 accent-primary shrink-0"
                    />
                    <span className="text-sm font-medium flex-1 min-w-0 break-words">{it.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {it.qty} шт{it.row_indexes.length > 1 ? ` · ${it.row_indexes.length} строки` : ""}
                    </span>
                  </label>

                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 mt-2 text-xs pl-6">
                    <span className="text-muted-foreground">Артикул</span>
                    <span className="font-mono">
                      {r.article || <span className="text-muted-foreground font-sans">пусто</span>}
                      {!it.article && p.model && (
                        <button
                          className="ml-2 text-primary hover:underline font-sans"
                          onClick={() => patch(it.key, { art: r.mode === "model" ? "empty" : "model" })}
                        >
                          {r.mode === "model" ? "оставить пустым" : "взять модель"}
                        </button>
                      )}
                    </span>
                    {it.barcode && (<><span className="text-muted-foreground">Штрихкод</span><span className="font-mono">{it.barcode}</span></>)}
                    <span className="text-muted-foreground">Бренд</span>
                    <span>{p.brand || "—"}</span>
                    <span className="text-muted-foreground">Группа</span>
                    <span>{p.group || "—"}</span>
                    <span className="text-muted-foreground">Модель</span>
                    <span className="font-mono">{p.model || "—"}</span>
                    {p.feature && (<><span className="text-muted-foreground">Признак</span><span>{p.feature}</span></>)}
                    <span className="text-muted-foreground self-center">Папка</span>
                    <div className="w-full sm:w-60">
                      <PickList
                        size="sm"
                        value={r.e.folder ?? ""}
                        onChange={(v) => patch(it.key, { folder: v || null })}
                        placeholder={folder ? `${folder} (как у всех)` : "Не выбрана"}
                        extra={[{ value: "", label: folder ? `Как у всех: ${folder}` : "Как у всех" }]}
                        options={folderOptions}
                      />
                    </div>
                  </div>

                  {it.duplicates.length === 0 && (it.other_features?.length ?? 0) > 0 && (
                    <p className="mt-2 pl-6 text-xs text-muted-foreground break-words">
                      У этой модели в каталоге есть: {it.other_features!.join(", ")} — создаётся новый вариант.
                    </p>
                  )}

                  {it.duplicates.length > 0 && (
                    <div className="mt-2 pl-6 space-y-1">
                      {it.duplicates.map((d, i) => (
                        <p key={i} className="text-xs text-amber-300 break-words">
                          <Icon name="TriangleAlert" size={12} className="inline mr-1 -mt-0.5" />
                          {d.reason}: {d.name}
                        </p>
                      ))}
                      <p className="text-[11px] text-muted-foreground">
                        Строка снята с создания. Лучше вернуться и выбрать этот товар вручную.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-white/[0.08] p-3">
            <div className="max-w-3xl mx-auto flex items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                {noFolder ? "У некоторых товаров не выбрана папка" : `К созданию: ${selected.length}`}
              </p>
              <Button className="rounded-xl" disabled={saving || selected.length === 0 || noFolder} onClick={submit}>
                {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="PackagePlus" size={16} />}
                <span className="ml-2">Создать {selected.length}</span>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CreateProducts;
