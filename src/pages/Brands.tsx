import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const BRANDS_URL = "https://functions.poehali.dev/6406512c-44db-46fe-bc84-7ab460f71dfe";

interface Brand {
  name: string;
  count: number;
}

const Brands = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // Добавление нового бренда
  const [showAddInput, setShowAddInput] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  // Редактирование
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Удаление
  const [deletingBrand, setDeletingBrand] = useState<string | null>(null);
  const [replaceWith, setReplaceWith] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await fetch(BRANDS_URL, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setBrands(data.items || []);
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (showAddInput) setTimeout(() => addInputRef.current?.focus(), 50);
  }, [showAddInput]);

  const startEdit = (brand: Brand) => {
    setDeletingBrand(null);
    setEditingBrand(brand.name);
    setEditValue(brand.name);
  };

  const cancelEdit = () => {
    setEditingBrand(null);
    setEditValue("");
  };

  const saveEdit = async (oldName: string) => {
    const newName = editValue.trim();
    if (!newName || newName === oldName) { cancelEdit(); return; }
    setSaving(true);
    try {
      const resp = await fetch(BRANDS_URL, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
      });
      if (resp.ok) {
        toast({ title: "Бренд переименован" });
        cancelEdit();
        load();
      } else {
        const d = await resp.json();
        toast({ title: "Ошибка", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const startDelete = (brand: Brand) => {
    setEditingBrand(null);
    if (brand.count === 0) {
      confirmDelete(brand.name, undefined);
      return;
    }
    setDeletingBrand(brand.name);
    setReplaceWith("");
  };

  const confirmDelete = async (brand: string, replace: string | undefined) => {
    setDeleting(true);
    try {
      const resp = await fetch(BRANDS_URL, {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ brand, replace_with: replace || null }),
      });
      if (resp.ok) {
        toast({ title: replace ? "Бренд заменён и удалён" : "Бренд удалён" });
        setDeletingBrand(null);
        load();
      } else {
        const d = await resp.json();
        toast({ title: "Ошибка", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const otherBrands = brands.filter(b => b.name !== deletingBrand);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/dashboard")}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg font-semibold">Бренды</h1>
          </div>
          <Button
            size="sm"
            className="h-8 rounded-xl"
            onClick={() => { setShowAddInput(true); setEditingBrand(null); setDeletingBrand(null); }}
          >
            <Icon name="Plus" size={14} />
            <span className="ml-1">Добавить</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-4 flex-1">
        {showAddInput && (
          <div className="flex gap-2 mb-3">
            <Input
              ref={addInputRef}
              placeholder="Название бренда..."
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newBrandName.trim()) {
                  setBrands(prev => [...prev, { name: newBrandName.trim(), count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
                  setNewBrandName("");
                  setShowAddInput(false);
                }
                if (e.key === "Escape") { setShowAddInput(false); setNewBrandName(""); }
              }}
              className="h-9 rounded-xl bg-secondary border-white/[0.08] text-sm"
            />
            <Button
              size="sm"
              className="rounded-xl"
              onClick={() => {
                if (newBrandName.trim()) {
                  setBrands(prev => [...prev, { name: newBrandName.trim(), count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
                  setNewBrandName("");
                  setShowAddInput(false);
                }
              }}
            >
              <Icon name="Check" size={14} />
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => { setShowAddInput(false); setNewBrandName(""); }}>
              <Icon name="X" size={14} />
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : brands.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="Tag" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Нет брендов</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {brands.map((brand) => (
              <div key={brand.name}>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                  {editingBrand === brand.name ? (
                    <div className="flex gap-2 items-center">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(brand.name);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="h-8 rounded-lg bg-secondary border-white/[0.08] text-sm flex-1"
                        autoFocus
                      />
                      <Button size="sm" className="h-8 rounded-lg px-2" onClick={() => saveEdit(brand.name)} disabled={saving}>
                        {saving ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Check" size={13} />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 rounded-lg px-2" onClick={cancelEdit}>
                        <Icon name="X" size={13} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{brand.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{brand.count} тов.</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/[0.08] transition-colors"
                          onClick={() => startEdit(brand)}
                        >
                          <Icon name="Pencil" size={13} className="text-muted-foreground" />
                        </button>
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/20 transition-colors"
                          onClick={() => startDelete(brand)}
                        >
                          <Icon name="Trash2" size={13} className="text-destructive" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {deletingBrand === brand.name && (
                  <div className="mt-1 p-3 rounded-xl border border-red-500/30 bg-red-950/20">
                    <p className="text-xs text-red-400 mb-2">
                      Бренд используется в {brand.count} товарах. Выберите замену:
                    </p>
                    <select
                      value={replaceWith}
                      onChange={(e) => setReplaceWith(e.target.value)}
                      className="w-full h-9 rounded-lg bg-secondary border border-white/[0.08] text-sm px-2 mb-2 text-foreground"
                    >
                      <option value="">— очистить бренд у товаров —</option>
                      {otherBrands.map(b => (
                        <option key={b.name} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="rounded-lg flex-1 bg-destructive hover:bg-destructive/90"
                        onClick={() => confirmDelete(brand.name, replaceWith || undefined)}
                        disabled={deleting}
                      >
                        {deleting ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Trash2" size={13} />}
                        <span className="ml-1">{replaceWith ? "Заменить и удалить" : "Удалить и очистить"}</span>
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setDeletingBrand(null)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Brands;
