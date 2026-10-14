import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import { useReceivingPerms } from "@/hooks/useReceivingPerms";

interface DocTile {
  key: string;
  perm: string;
  title: string;
  hint: string;
  icon: string;
  ready: boolean;
}

const DOCS: DocTile[] = [
  {
    key: "batches",
    perm: "docs_batches_see",
    title: "Список (Партия)",
    hint: "Коробки и паллеты со своим номером и наклейкой",
    icon: "Boxes",
    ready: false,
  },
  {
    key: "move",
    perm: "docs_move",
    title: "Перемещение",
    hint: "Перевозка товара и партий в другое место",
    icon: "Truck",
    ready: false,
  },
  {
    key: "writeoff",
    perm: "docs_writeoff",
    title: "Списание",
    hint: "Утилизация и списание товара",
    icon: "Trash2",
    ready: false,
  },
  {
    key: "sale",
    perm: "docs_sale",
    title: "Продажа",
    hint: "Отгрузка товара и партий покупателю",
    icon: "HandCoins",
    ready: false,
  },
  {
    key: "income",
    perm: "docs_income",
    title: "Поступление",
    hint: "Приход товара на склады",
    icon: "PackagePlus",
    ready: false,
  },
];

/** Раздел «Документы» складов приёмки: плитки видов документов по правам. */
const ReceivingDocuments = () => {
  const navigate = useNavigate();
  const { can, loading } = useReceivingPerms();

  const back = () => navigate("/admin/receiving-stock");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!can("docs_access")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="Lock" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium mb-1">Документы вам не открыты</p>
          <p className="text-sm text-muted-foreground mb-4">Обратитесь к владельцу</p>
          <Button onClick={back}>К складам</Button>
        </div>
      </div>
    );
  }

  const mine = DOCS.filter((d) => can(d.perm));

  const open = (d: DocTile) => {
    toast({ title: `«${d.title}» — скоро`, description: "Раздел в разработке" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={back}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-base font-semibold">Документы</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-4 space-y-2">
        {mine.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            Ни один вид документов вам пока не открыт
          </p>
        )}
        {mine.map((d) => (
          <button
            key={d.key}
            onClick={() => open(d)}
            className="w-full text-left rounded-xl border border-white/[0.08] bg-card hover:bg-white/[0.04] px-4 py-3 flex items-center gap-3 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
              <Icon name={d.icon} size={20} className="text-violet-300" fallback="FileText" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{d.title}</div>
              <div className="text-xs text-muted-foreground">{d.hint}</div>
            </div>
            {!d.ready && (
              <span className="text-[11px] text-muted-foreground shrink-0">скоро</span>
            )}
            <Icon name="ChevronRight" size={18} className="text-muted-foreground shrink-0" />
          </button>
        ))}
      </main>
    </div>
  );
};

export default ReceivingDocuments;
