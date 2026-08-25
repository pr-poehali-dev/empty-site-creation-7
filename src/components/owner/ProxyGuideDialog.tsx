import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import type { Recipe } from "./proxyRecipes";

interface Props {
  recipe: Recipe | null;
  proxyKey: string;
  onClose: () => void;
  onAddProxy: (url: string) => void;
  onNeedKey: () => void;
}

export default function ProxyGuideDialog({
  recipe,
  proxyKey,
  onClose,
  onAddProxy,
  onNeedKey,
}: Props) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");

  if (!recipe) return null;

  const code = recipe.code(proxyKey || "СНАЧАЛА_СГЕНЕРИРУЙТЕ_КЛЮЧ");

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Код скопирован" });
    } catch {
      toast({ title: "Не удалось скопировать", description: "Выделите код вручную", variant: "destructive" });
    }
  };

  const add = () => {
    const v = url.trim().replace(/\/+$/, "");
    if (!v) return;
    if (!/^https?:\/\//.test(v)) {
      toast({ title: "Неверный адрес", description: "Адрес должен начинаться с https://", variant: "destructive" });
      return;
    }
    onAddProxy(v);
    setUrl("");
    onClose();
  };

  const p = recipe.price;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name={recipe.icon} size={20} />
            {recipe.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-2">
            <p className="text-sm font-medium">Сколько это стоит</p>
            <dl className="text-xs space-y-1.5">
              {[
                ["Цена", p.cost],
                ["Карта", p.card],
                ["Бесплатный лимит", p.limit],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted-foreground w-32 shrink-0">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground pt-1">{p.enough}</p>
            {p.catch && (
              <div className="flex items-start gap-2 pt-1">
                <Icon name="TriangleAlert" size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/90">{p.catch}</p>
              </div>
            )}
          </div>

          {!proxyKey && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <p className="text-xs text-amber-200/90">
                Сначала нужен ключ — без него код работать не будет.
              </p>
              <Button size="sm" onClick={onNeedKey} className="w-full">
                <Icon name="Key" size={14} className="mr-1.5" />
                Сгенерировать ключ
              </Button>
            </div>
          )}

          <ol className="space-y-3">
            {recipe.steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-medium flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Код — {recipe.fileName}</p>
              <Button variant="outline" size="sm" onClick={copyCode} disabled={!proxyKey}>
                <Icon name="Copy" size={14} className="mr-1.5" />
                Скопировать
              </Button>
            </div>
            <pre className="p-3 rounded-lg bg-black/40 border border-white/[0.06] text-[10px] leading-relaxed overflow-x-auto max-h-48 overflow-y-auto">
              {code}
            </pre>
            {proxyKey && (
              <p className="text-xs text-muted-foreground">
                Ключ уже внутри — правьте ничего не нужно.
              </p>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <p className="text-sm font-medium">Адрес посредника</p>
            <p className="text-xs text-muted-foreground">
              Вставьте то, что выдала площадка. Например: {recipe.urlHint}
            </p>
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="https://..."
                className="text-xs"
              />
              <Button onClick={add} disabled={!url.trim()} className="shrink-0">
                <Icon name="Plus" size={16} />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
