import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const PRODUCTS_URL =
  "https://functions.poehali.dev/92f7ddb5-724d-4e82-8054-0fac4479b3f5";
const NEW_BARCODES_URL =
  "https://functions.poehali.dev/753c16bb-172a-460b-a7b4-2ffc3c26b6f7";

export interface UnknownBarcodeProduct {
  id: number;
  name: string;
  article: string | null;
  brand: string | null;
  supplier_code?: string | null;
  price_base?: number | null;
  price_retail?: number | null;
  price_wholesale?: number | null;
  price_purchase?: number | null;
  product_group?: string | null;
  external_id?: string | null;
}

interface Props {
  barcode: string | null;
  token: string;
  onClose: () => void;
  onProductSelected: (product: UnknownBarcodeProduct) => void;
  onCreateTemp?: (barcode: string) => void;
}

export default function UnknownBarcodeDialog({
  barcode,
  token,
  onClose,
  onProductSelected,
  onCreateTemp,
}: Props) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnknownBarcodeProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const open = barcode !== null;

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

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
  }, [query, token]);

  const handlePick = async (product: UnknownBarcodeProduct) => {
    if (!barcode || linking) return;
    setLinking(true);
    try {
      await fetch(NEW_BARCODES_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          barcode,
          nomenclature_id: product.id,
          save_to_product: true,
        }),
      });
      toast({
        title: "Штрихкод привязан",
        description: `${barcode} → ${product.name}`,
      });
      onProductSelected(product);
      onClose();
    } catch {
      toast({ title: "Ошибка привязки", variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const handleCreateTemp = () => {
    if (!barcode) return;
    onCreateTemp?.(barcode);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="ScanBarcode" size={20} />
            Штрихкод не найден
          </DialogTitle>
          <DialogDescription>
            Код{" "}
            <span className="font-mono font-semibold text-foreground">
              {barcode}
            </span>{" "}
            ещё не привязан к товару. Найди существующий — штрихкод привяжется
            автоматически. Или создай новый товар.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Icon
              name="Search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя, артикул или бренд (от 2 символов)"
              className="pl-9"
              disabled={linking}
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {searching && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <Icon
                  name="Loader2"
                  size={16}
                  className="inline-block animate-spin mr-2"
                />
                Ищу...
              </div>
            )}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Ничего не найдено
              </div>
            )}
            {!searching && query.trim().length < 2 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Начни вводить название товара
              </div>
            )}
            {!searching &&
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePick(p)}
                  disabled={linking}
                  className="w-full text-left px-3 py-2 border-b border-border last:border-b-0 hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[p.brand, p.article].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
              ))}
          </div>

          <div className="flex gap-2 pt-2">
            {onCreateTemp && (
              <Button
                variant="outline"
                onClick={handleCreateTemp}
                disabled={linking}
                className="flex-1"
              >
                <Icon name="Plus" size={16} className="mr-2" />
                Создать товар
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={linking}
              className="flex-1"
            >
              Отмена
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
