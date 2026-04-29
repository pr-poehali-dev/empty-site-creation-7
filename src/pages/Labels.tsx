import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import Icon from "@/components/ui/icon";
import LabelPreview from "@/components/labels/LabelPreview";
import LabelTemplateEditor, {
  LabelRow,
} from "@/components/labels/LabelTemplateEditor";
import PrintLabelsView from "@/components/labels/PrintLabelsView";

const PRODUCTS_URL =
  "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const TEMPLATES_URL =
  "https://functions.poehali.dev/c834571a-6ed5-44eb-a98b-a0f6eaabd7d0";

export interface LabelProduct {
  id: number;
  name: string;
  article: string | null;
  brand: string | null;
  price_base?: number | null;
  price_retail?: number | null;
  price_wholesale?: number | null;
  price_purchase?: number | null;
  external_id?: string | null;
  is_temp?: boolean;
}

interface LabelLine extends LabelProduct {
  copies: number;
}

interface SavedTemplate {
  id: number;
  name: string;
  width_mm: number;
  height_mm: number;
  dpi: number;
  rows: LabelRow[];
}

const PRESETS = [
  { label: "58 × 40 мм", width: 58, height: 40 },
  { label: "40 × 30 мм", width: 40, height: 30 },
  { label: "30 × 20 мм", width: 30, height: 20 },
  { label: "Свой размер", width: 0, height: 0 },
];

const defaultRows: LabelRow[] = [
  { id: "r1", type: "text", content: "{товар}", fontSize: 10, bold: true, align: "center" },
  { id: "r2", type: "text", content: "Арт: {артикул}", fontSize: 8, bold: false, align: "left" },
  { id: "r3", type: "text", content: "{розничная_цена} ₽", fontSize: 14, bold: true, align: "center" },
  { id: "r4", type: "barcode", content: "{штрихкод}", fontSize: 8, bold: false, align: "center" },
];

const Labels = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LabelProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<LabelLine[]>([]);

  const [width, setWidth] = useState(58);
  const [height, setHeight] = useState(40);
  const [dpi, setDpi] = useState(203);
  const [presetIdx, setPresetIdx] = useState("0");

  const [rows, setRows] = useState<LabelRow[]>(defaultRows);
  const [previewIdx, setPreviewIdx] = useState(0);

  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTplId, setSelectedTplId] = useState<string>("");
  const [tplName, setTplName] = useState("");

  const [printing, setPrinting] = useState(false);

  // Поиск
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          search: query,
          search_type: "all",
          per_page: "10",
        });
        const resp = await fetch(`${PRODUCTS_URL}?${params}`, {
          headers: authHeaders,
        });
        const data = await resp.json();
        if (resp.ok) setResults(data.items || []);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Загрузка шаблонов
  const loadTemplates = useCallback(async () => {
    try {
      const resp = await fetch(TEMPLATES_URL, { headers: authHeaders });
      const data = await resp.json();
      if (resp.ok) setTemplates(data.items || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Возврат с UnknownBarcodePage
  useEffect(() => {
    const stored = sessionStorage.getItem("pending_unknown_product");
    if (stored) {
      try {
        const p: LabelProduct = JSON.parse(stored);
        addProduct(p);
      } catch {
        // ignore
      }
      sessionStorage.removeItem("pending_unknown_product");
    }
  }, []);

  const addProduct = (p: LabelProduct) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], copies: next[idx].copies + 1 };
        return next;
      }
      return [...prev, { ...p, copies: 1 }];
    });
    setQuery("");
    setResults([]);
  };

  // Сканер
  const handleScan = useCallback(
    async (code: string) => {
      try {
        const params = new URLSearchParams({
          search: code,
          search_type: "all",
          per_page: "1",
        });
        const resp = await fetch(`${PRODUCTS_URL}?${params}`, {
          headers: authHeaders,
        });
        const data = await resp.json();
        if (resp.ok && data.items && data.items.length > 0) {
          addProduct(data.items[0]);
          toast({ title: "Товар добавлен", description: data.items[0].name });
        } else {
          navigate(`/admin/orders/unknown-barcode/${encodeURIComponent(code)}`);
        }
      } catch {
        toast({ title: "Ошибка поиска", variant: "destructive" });
      }
    },
    [navigate],
  );

  useBarcodeScanner({ enabled: true, onScan: handleScan });

  // Изменение тиража
  const setCopies = (idx: number, value: number) => {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], copies: Math.max(1, value) };
      return next;
    });
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Пресеты
  const handlePreset = (val: string) => {
    setPresetIdx(val);
    const p = PRESETS[parseInt(val)];
    if (p && p.width > 0) {
      setWidth(p.width);
      setHeight(p.height);
    }
  };

  // Шаблоны
  const handleLoadTemplate = (val: string) => {
    setSelectedTplId(val);
    if (!val) return;
    const t = templates.find((x) => String(x.id) === val);
    if (t) {
      setWidth(Number(t.width_mm));
      setHeight(Number(t.height_mm));
      setDpi(t.dpi);
      setRows(t.rows && t.rows.length > 0 ? t.rows : defaultRows);
      setTplName(t.name);
      setPresetIdx("3");
    }
  };

  const saveTemplate = async () => {
    const name = tplName.trim();
    if (!name) {
      toast({ title: "Введите название шаблона", variant: "destructive" });
      return;
    }
    try {
      const isUpdate = selectedTplId && templates.some((t) => String(t.id) === selectedTplId);
      const url = isUpdate ? `${TEMPLATES_URL}?id=${selectedTplId}` : TEMPLATES_URL;
      const resp = await fetch(url, {
        method: isUpdate ? "PUT" : "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name,
          width_mm: width,
          height_mm: height,
          dpi,
          rows,
        }),
      });
      if (resp.ok) {
        toast({ title: isUpdate ? "Шаблон обновлён" : "Шаблон сохранён" });
        await loadTemplates();
      } else {
        const data = await resp.json();
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    }
  };

  const deleteTemplate = async () => {
    if (!selectedTplId) return;
    try {
      const resp = await fetch(`${TEMPLATES_URL}?id=${selectedTplId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (resp.ok) {
        toast({ title: "Шаблон удалён" });
        setSelectedTplId("");
        setTplName("");
        await loadTemplates();
      }
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (lines.length === 0) {
      toast({ title: "Добавь хотя бы один товар", variant: "destructive" });
      return;
    }
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 100);
  };

  const totalLabels = lines.reduce((sum, l) => sum + l.copies, 0);
  const previewProduct: LabelProduct =
    lines[previewIdx] || {
      id: 0,
      name: "Пример товара",
      article: "ART-001",
      brand: "Бренд",
      price_retail: 1990,
      price_wholesale: 1500,
      external_id: "4600000000001",
    };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border print:hidden">
        <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => navigate(-1)}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-base font-semibold flex-1">Этикетки</h1>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {/* TODO: переход на сканер */}}
          >
            <Icon name="ScanLine" size={16} />
            <span className="ml-1.5 hidden sm:inline">Сканер</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {/* TODO: переход на список */}}
          >
            <Icon name="ListPlus" size={16} />
            <span className="ml-1.5 hidden sm:inline">Списком</span>
          </Button>
          <Button size="sm" className="h-9" onClick={handlePrint} disabled={lines.length === 0}>
            <Icon name="Printer" size={16} />
            <span className="ml-1.5 hidden sm:inline">Печать</span>
            {totalLabels > 0 && (
              <span className="ml-1.5 text-xs opacity-80">({totalLabels})</span>
            )}
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 py-3 grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
        {/* Левая колонка — товары */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="text-sm font-medium">Подбор товаров</div>
            <div className="relative">
              <Icon
                name="Search"
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию, артикулу, бренду"
                className="pl-9 h-10"
              />
              {searching && (
                <Icon
                  name="Loader2"
                  size={16}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                />
              )}
            </div>

            {results.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/40 border-b border-border last:border-0"
                  >
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[p.brand, p.article].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border">
            <div className="px-3 py-2 text-sm font-medium border-b border-border flex items-center justify-between">
              <span>Список товаров</span>
              <span className="text-xs text-muted-foreground">
                Всего этикеток: {totalLabels}
              </span>
            </div>
            {lines.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Добавьте товары через поиск или сканер
              </div>
            ) : (
              <div className="divide-y divide-border">
                {lines.map((l, i) => (
                  <div
                    key={`${l.id}-${i}`}
                    className={`px-3 py-2 flex items-center gap-2 ${
                      i === previewIdx ? "bg-muted/30" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => setPreviewIdx(i)}
                    >
                      <div className="text-sm font-medium truncate">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[l.brand, l.article].filter(Boolean).join(" · ")}
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setCopies(i, l.copies - 1)}
                      >
                        <Icon name="Minus" size={14} />
                      </Button>
                      <Input
                        value={l.copies}
                        onChange={(e) => setCopies(i, parseInt(e.target.value) || 1)}
                        className="h-7 w-12 text-center px-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setCopies(i, l.copies + 1)}
                      >
                        <Icon name="Plus" size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => removeLine(i)}
                      >
                        <Icon name="X" size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Правая колонка — шаблон + превью */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="text-sm font-medium">Размер этикетки</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Пресет</Label>
                <Select value={presetIdx} onValueChange={handlePreset}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">DPI</Label>
                <Select value={String(dpi)} onValueChange={(v) => setDpi(parseInt(v))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="203">203 dpi</SelectItem>
                    <SelectItem value="300">300 dpi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Ширина (мм)</Label>
                <Input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Высота (мм)</Label>
                <Input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="text-sm font-medium">Шаблон</div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={selectedTplId} onValueChange={handleLoadTemplate}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Загрузить шаблон..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="Название шаблона"
                className="h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 flex-1" onClick={saveTemplate}>
                <Icon name="Save" size={14} />
                <span className="ml-1.5">Сохранить</span>
              </Button>
              {selectedTplId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={deleteTemplate}
                >
                  <Icon name="Trash2" size={14} />
                </Button>
              )}
            </div>
          </div>

          <LabelTemplateEditor rows={rows} onChange={setRows} />

          <div className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium mb-2">Превью</div>
            <div className="flex justify-center bg-muted/20 p-4 rounded">
              <LabelPreview
                product={previewProduct}
                rows={rows}
                widthMm={width}
                heightMm={height}
                scale={4}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Печатный блок */}
      <PrintLabelsView
        lines={lines}
        rows={rows}
        widthMm={width}
        heightMm={height}
      />
    </div>
  );
};

export default Labels;
