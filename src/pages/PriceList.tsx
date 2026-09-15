import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const PRICE_URL = "https://functions.poehali.dev/f0c7f8e2-5238-412f-b509-3a51d808a1df";

interface PriceItem {
  brand: string;
  barcode: string;
  article: string;
  name: string;
  price: number;
  is_temp: boolean;
}

const PriceList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const token = localStorage.getItem("auth_token") || "";

  const preselected: number[] = location.state?.orderIds || [];

  const [mode, setMode] = useState<"selected" | "filter">(
    preselected.length > 0 ? "selected" : "filter"
  );
  const [firms, setFirms] = useState<string[]>([]);
  const [pickedFirms, setPickedFirms] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [items, setItems] = useState<PriceItem[]>([]);
  const [zeroItems, setZeroItems] = useState<PriceItem[]>([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [built, setBuilt] = useState(false);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetch(PRICE_URL, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => setFirms(d.firms || []))
      .catch(() => {});
  }, []);

  const buildPayload = (format?: string) => ({
    ...(mode === "selected" ? { order_ids: preselected } : {}),
    ...(mode === "filter"
      ? {
          date_from: dateFrom || null,
          date_to: dateTo || null,
          firms: Array.from(pickedFirms),
        }
      : {}),
    include_archived: includeArchived,
    ...(format ? { format } : {}),
  });

  const build = async () => {
    setLoading(true);
    try {
      const resp = await fetch(PRICE_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(buildPayload()),
      });
      const data = await resp.json();
      if (resp.ok) {
        setItems(data.items || []);
        setZeroItems(data.zero_items || []);
        setOrdersCount(data.orders_count || 0);
        setBuilt(true);
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось собрать прайс", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const resp = await fetch(PRICE_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(buildPayload("xlsx")),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
        return;
      }
      const bin = atob(data.file);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "price.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Ошибка", description: "Не удалось скачать файл", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const toggleFirm = (firm: string) => {
    const next = new Set(pickedFirms);
    if (next.has(firm)) next.delete(firm);
    else next.add(firm);
    setPickedFirms(next);
  };

  const renderRows = (list: PriceItem[], withPrice: boolean) =>
    list.map((it, idx) => (
      <tr key={`${it.article}-${it.name}-${idx}`} className="border-b border-white/[0.06]">
        <td className="px-2 py-2 text-xs text-muted-foreground">{it.brand || "—"}</td>
        <td className="px-2 py-2 text-xs font-mono text-muted-foreground">{it.barcode || "—"}</td>
        <td className="px-2 py-2 text-xs font-mono">{it.article || "—"}</td>
        <td className="px-2 py-2 text-sm">
          {it.name}
          {it.is_temp && (
            <span className="ml-1 text-[10px] text-yellow-400">врем.</span>
          )}
        </td>
        <td className="px-2 py-2 text-sm text-right font-semibold whitespace-nowrap">
          {withPrice ? `${it.price.toLocaleString()} Br` : "—"}
        </td>
      </tr>
    ));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin/orders")}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">Прайс для оптовика</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex gap-2 mb-4">
          <button
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "selected"
                ? "bg-primary/20 text-primary"
                : "bg-white/[0.04] text-muted-foreground"
            } ${preselected.length === 0 ? "opacity-40" : ""}`}
            disabled={preselected.length === 0}
            onClick={() => { setMode("selected"); setBuilt(false); }}
          >
            По выбранным ({preselected.length})
          </button>
          <button
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "filter"
                ? "bg-primary/20 text-primary"
                : "bg-white/[0.04] text-muted-foreground"
            }`}
            onClick={() => { setMode("filter"); setBuilt(false); }}
          >
            По периоду и фирмам
          </button>
        </div>

        {mode === "filter" && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-4 mb-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Период с</label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setBuilt(false); }} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">по</label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setBuilt(false); }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">
                  Фирмы {pickedFirms.size > 0 ? `(выбрано ${pickedFirms.size})` : "(все)"}
                </label>
                {pickedFirms.size > 0 && (
                  <button className="text-xs text-primary" onClick={() => setPickedFirms(new Set())}>
                    Сбросить
                  </button>
                )}
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                {firms.map((f) => (
                  <label key={f} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary"
                      checked={pickedFirms.has(f)}
                      onChange={() => { toggleFirm(f); setBuilt(false); }}
                    />
                    <span className="text-sm">{f}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary"
            checked={includeArchived}
            onChange={(e) => { setIncludeArchived(e.target.checked); setBuilt(false); }}
          />
          <span className="text-sm text-muted-foreground">Включая архивные заявки</span>
        </label>

        <Button className="w-full h-11" onClick={build} disabled={loading}>
          {loading ? (
            <Icon name="Loader2" size={18} className="animate-spin" />
          ) : (
            <>
              <Icon name="FileText" size={18} />
              <span className="ml-2">Сформировать прайс</span>
            </>
          )}
        </Button>

        {built && (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Товаров {items.length + zeroItems.length}, из заявок {ordersCount}
              </p>
              {items.length + zeroItems.length > 0 && (
                <Button variant="outline" className="h-9" onClick={downloadExcel} disabled={downloading}>
                  {downloading ? (
                    <Icon name="Loader2" size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Icon name="Download" size={16} />
                      <span className="ml-1">Скачать Excel</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {items.length + zeroItems.length === 0 ? (
              <div className="text-center py-10">
                <Icon name="SearchX" size={40} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">По этим условиям товаров не нашлось</p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-card overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                      <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Бренд</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Штрихкод</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Артикул</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Наименование</th>
                      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderRows(items, true)}
                    {zeroItems.length > 0 && (
                      <>
                        <tr>
                          <td colSpan={5} className="px-2 py-2 bg-red-500/10 text-xs font-semibold text-red-400">
                            Без цены — {zeroItems.length} шт., проставьте вручную
                          </td>
                        </tr>
                        {renderRows(zeroItems, false)}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PriceList;
