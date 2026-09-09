import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import InventoryLineCard from "./InventoryLineCard";
import InventoryVisibilityDialog from "./InventoryVisibilityDialog";
import * as api from "./inventoryApi";
import {
  Inventory,
  InventoryItem,
  INVENTORIES_URL,
  ProductSearchItem,
  SEARCH_MODES,
} from "./types";

const InventoryEditPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const inventoryId = id ? parseInt(id) : 0;
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const [inv, setInv] = useState<Inventory | null>(null);
  const [lines, setLines] = useState<InventoryItem[]>([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);

  const [searchMode, setSearchMode] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [productGroups, setProductGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [showGroupList, setShowGroupList] = useState(false);

  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeResults, setBarcodeResults] = useState<ProductSearchItem[]>([]);

  const [showVisibility, setShowVisibility] = useState(false);
  const [recalcing, setRecalcing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isOwner = inv?.is_owner ?? false;
  const canEditPrices = inv?.can_edit_prices ?? false;

  const load = async () => {
    try {
      const data = await api.fetchInventory(inventoryId);
      setInv(data);
      setLines([...data.items].reverse());
      setComment(data.comment || "");
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!inventoryId) return;
    load();
    api
      .fetchProductGroups(inventoryId)
      .then((r) => setProductGroups(r.groups))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryId]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setShowGroupList(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const zeroCount = lines.filter((l) => !l.price || l.price === 0).length;

  const runSearch = async (q: string, mode = searchMode, group = selectedGroup) => {
    if (q.trim().length < 2 && !group) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await api.searchProducts(inventoryId, q, mode, group);
      setSearchResults(r.products);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  };

  const addProduct = async (p: ProductSearchItem) => {
    try {
      const r = await api.addItem(inventoryId, p.id, 1);
      setLines((prev) => [r.item, ...prev]);
      setSearchQuery("");
      setSearchResults([]);
      setBarcodeValue("");
      setBarcodeResults([]);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const handleBarcodeInput = async (value: string) => {
    setBarcodeValue(value);
    if (value.trim().length < 3) {
      setBarcodeResults([]);
      return;
    }
    try {
      const r = await api.scanBarcode(inventoryId, value.trim(), false);
      setBarcodeResults(r.products);
    } catch {
      setBarcodeResults([]);
    }
  };

  const handleBarcodeEnter = async () => {
    const code = barcodeValue.trim();
    if (!code) return;
    try {
      const r = await api.scanBarcode(inventoryId, code, true);
      if (r.product) {
        await addProduct(r.product);
      } else {
        toast({ title: "Товар со штрихкодом не найден", variant: "destructive" });
        setBarcodeValue("");
      }
      setBarcodeResults([]);
      setTimeout(() => barcodeRef.current?.focus(), 50);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const onQty = async (itemId: number, qty: number) => {
    if (qty < 0) return;
    setLines((prev) =>
      prev.map((l) => (l.id === itemId ? { ...l, quantity: qty, amount: qty * l.price } : l))
    );
    try {
      const r = await api.updateItem(inventoryId, itemId, { quantity: qty });
      setLines((prev) => prev.map((l) => (l.id === itemId ? r.item : l)));
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      load();
    }
  };

  const onPrice = async (itemId: number, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.id === itemId ? { ...l, price, amount: price * l.quantity } : l))
    );
    try {
      const r = await api.updateItem(inventoryId, itemId, { price });
      setLines((prev) => prev.map((l) => (l.id === itemId ? r.item : l)));
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      load();
    }
  };

  const onRemove = async (itemId: number) => {
    try {
      await api.deleteItem(inventoryId, itemId);
      setLines((prev) => prev.filter((l) => l.id !== itemId));
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const handleSaveComment = async () => {
    try {
      await api.updateHeader(inventoryId, comment);
      toast({ title: "Сохранено" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const handleRecalcZero = async () => {
    setRecalcing(true);
    try {
      const r = await api.recalcZeroPrices(inventoryId);
      toast({ title: `Обновлено ${r.updated} из ${r.total_zero}` });
      load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setRecalcing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem("auth_token") || "";
      const resp = await fetch(`${INVENTORIES_URL}?id=${inventoryId}&export=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Не удалось выгрузить");
      const bin = atob(data.file);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || `Инвентаризация-${inventoryId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Удалить инвентаризацию?")) return;
    try {
      await api.deleteInventory(inventoryId);
      navigate(isOwner ? "/admin/inventories" : "/wholesaler/inventories");
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showDropdown = searchQuery.trim().length >= 2 && searchResults.length > 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-2 mb-4">
          <button
            className="w-9 h-9 rounded-xl border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.06]"
            onClick={() => navigate(-1)}
          >
            <Icon name="ArrowLeft" size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold truncate">Инвентаризация №{inventoryId}</h1>
            <p className="text-xs text-muted-foreground truncate">{inv?.wholesaler_name}</p>
          </div>
          {isOwner && (
            <button
              className="w-9 h-9 rounded-xl border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.06]"
              onClick={() => setShowVisibility(true)}
              title="Настройки видимости"
            >
              <Icon name="Settings" size={16} />
            </button>
          )}
        </div>

        <div className="flex gap-1 mb-3 items-start">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide flex-1" style={{ scrollbarWidth: "none" }}>
            {SEARCH_MODES.map((mode) => (
              <button
                key={mode.value}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  searchMode === mode.value
                    ? "bg-primary/20 text-primary"
                    : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
                }`}
                onClick={() => {
                  setSearchMode(mode.value);
                  if (searchQuery.trim()) runSearch(searchQuery, mode.value);
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="relative flex-shrink-0" ref={groupRef}>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                selectedGroup
                  ? "bg-primary/20 text-primary"
                  : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
              }`}
              onClick={() => setShowGroupList(!showGroupList)}
            >
              {selectedGroup || "Группа"}
              <Icon name={showGroupList ? "ChevronUp" : "ChevronDown"} size={12} />
            </button>
            {showGroupList && (
              <div className="absolute top-full right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-60 overflow-y-auto shadow-lg min-w-[200px]">
                {selectedGroup && (
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm text-primary border-b border-white/[0.04]"
                    onClick={() => {
                      setSelectedGroup("");
                      setShowGroupList(false);
                      if (searchQuery.trim()) runSearch(searchQuery, searchMode, "");
                    }}
                  >
                    Все группы
                  </button>
                )}
                {productGroups.map((g) => (
                  <button
                    key={g}
                    className={`w-full text-left px-3 py-2 hover:bg-white/[0.06] text-sm border-b border-white/[0.04] last:border-0 ${
                      selectedGroup === g ? "bg-white/[0.06] text-primary" : ""
                    }`}
                    onClick={() => {
                      setSelectedGroup(g);
                      setShowGroupList(false);
                      if (searchQuery.trim()) runSearch(searchQuery, searchMode, g);
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Input
              placeholder={
                searchMode === "article"
                  ? "Введите артикул..."
                  : searchMode === "supplier_code"
                    ? "Введите код поставщика..."
                    : "Поиск по названию, артикулу, штрихкоду..."
              }
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="h-10 rounded-xl bg-secondary border-white/[0.08] text-sm pr-8"
            />
            {searching && (
              <Icon
                name="Loader2"
                size={14}
                className="absolute right-3 top-3 animate-spin text-muted-foreground"
              />
            )}
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-72 overflow-y-auto shadow-lg">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-sm flex items-center justify-between border-b border-white/[0.04] last:border-0"
                    onClick={() => addProduct(item)}
                  >
                    <div className="min-w-0">
                      <span className="block break-words">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.article || ""}
                        {item.article && item.brand ? " · " : ""}
                        {item.brand || ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                      {item.price ? `${item.price.toLocaleString()} Br` : "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${
              showBarcode ? "border-primary bg-primary/20" : "border-white/[0.08] hover:bg-white/[0.06]"
            }`}
            onClick={() => {
              setShowBarcode(!showBarcode);
              if (!showBarcode) setTimeout(() => barcodeRef.current?.focus(), 100);
            }}
            title="Сканер штрихкодов"
          >
            <Icon name="ScanBarcode" size={18} />
          </button>
        </div>

        {showBarcode && (
          <div className="relative mb-3">
            <Input
              ref={barcodeRef}
              placeholder="Введите или отсканируйте штрихкод..."
              value={barcodeValue}
              onChange={(e) => handleBarcodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleBarcodeEnter();
              }}
              className="h-10 rounded-xl bg-secondary border-white/[0.08] text-sm"
            />
            {barcodeResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-white/[0.08] rounded-xl bg-orange-950 overflow-hidden max-h-60 overflow-y-auto shadow-lg">
                {barcodeResults.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-sm flex items-center justify-between border-b border-white/[0.04] last:border-0"
                    onClick={() => addProduct(item)}
                  >
                    <div className="min-w-0">
                      <span className="block break-words">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.article || ""}</span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                      {item.price ? `${item.price.toLocaleString()} Br` : "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-3">
          <Textarea
            placeholder="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={handleSaveComment}
            rows={2}
            className="rounded-xl bg-secondary border-white/[0.08] text-sm"
          />
        </div>

        {lines.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="PackageSearch" size={48} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Найдите и добавьте товары</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {lines.map((line, i) => (
              <InventoryLineCard
                key={line.id}
                line={line}
                index={i}
                total={lines.length}
                isOwner={isOwner}
                canEditPrices={canEditPrices}
                onQty={onQty}
                onPrice={onPrice}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between px-1 text-sm">
            <span className="text-muted-foreground">Позиций: {lines.length}</span>
            <span className="font-semibold">Итого: {total.toLocaleString()} Br</span>
          </div>

          <Button className="w-full h-11 rounded-xl" onClick={handleSaveComment}>
            <Icon name="Check" size={16} />
            <span className="ml-2">Сохранить</span>
          </Button>

          <Button
            variant="outline"
            className="w-full h-11 rounded-xl border-white/[0.08]"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              <Icon name="FileSpreadsheet" size={16} />
            )}
            <span className="ml-2">Выгрузить в Excel</span>
          </Button>

          <Button
            variant="outline"
            className="w-full h-11 rounded-xl border-white/[0.08]"
            onClick={handleRecalcZero}
            disabled={recalcing || zeroCount === 0}
          >
            {recalcing ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              <Icon name="RefreshCw" size={16} />
            )}
            <span className="ml-2">
              Обновить все нулевые цены{zeroCount > 0 ? ` (${zeroCount})` : ""}
            </span>
          </Button>

          {isOwner && (
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
            >
              <Icon name="Trash2" size={16} />
              <span className="ml-2">Удалить инвентаризацию</span>
            </Button>
          )}
        </div>
      </div>

      {showVisibility && isOwner && (
        <InventoryVisibilityDialog
          inventoryId={inventoryId}
          onClose={() => setShowVisibility(false)}
        />
      )}
    </div>
  );
};

export default InventoryEditPage;