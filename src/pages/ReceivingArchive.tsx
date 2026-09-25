import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";
import ArchiveItemCard from "./receiving-daily/ArchiveItemCard";
import DailyCounters from "./receiving-daily/DailyCounters";
import DeleteDialog from "./receiving-daily/DeleteDialog";
import {
  KIND_TITLES,
  deleteReceiving,
  loadArchive,
  type Counters,
  type DailyItem,
  type Receiving,
} from "./receiving-daily/dailyApi";

const EMPTY: Counters = { sale: 0, wipe: 0, repair: 0, scrap: 0, total: 0 };

const RESULT_CLS: Record<string, string> = {
  sale: "text-emerald-300",
  wipe: "text-sky-300",
  repair: "text-amber-300",
  scrap: "text-rose-300",
};

const dateRu = (v: string) =>
  new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

/** Закрытая приёмка: смотреть можно, править нельзя. Сканер тут не нужен. */
const ReceivingArchive = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [sp] = useSearchParams();
  const rid = Number(id || 0);

  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [receiving, setReceiving] = useState<Receiving | null>(null);
  const [counters, setCounters] = useState<Counters>(EMPTY);
  const [items, setItems] = useState<DailyItem[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<DailyItem | null>(null);
  const [mayDelete, setMayDelete] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const first = useRef(true);

  const goBack = () => navigate(sp.get("back") || "/admin/receipts");

  // Удалять можно только пустую закрытую — где сервер откажет, кнопки нет.
  // Считаем по счётчику, а не по списку: при поиске список пуст, а товар есть.
  const deletable = mayDelete && Boolean(receiving?.closed) && counters.total === 0;

  const remove = async () => {
    if (!receiving) return;
    setDeleting(true);
    try {
      await deleteReceiving(receiving.id);
      toast({ title: "Приёмка удалена" });
      goBack();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      setDeleting(false);
      setAskDelete(false);
    }
  };

  const fetchData = useCallback(
    async (q: string) => {
      setBusy(true);
      try {
        const d = await loadArchive(rid, q);
        setReceiving(d.receiving);
        setCounters(d.counters);
        setItems(d.items);
        setMayDelete(Boolean(d.can_delete));
        setStage("ready");
      } catch (e) {
        setError((e as Error).message);
        setStage("error");
      } finally {
        setBusy(false);
      }
    },
    [rid]
  );

  useEffect(() => {
    if (!rid) {
      setError("Приёмка не указана");
      setStage("error");
      return;
    }
    if (first.current) {
      first.current = false;
      fetchData("");
      return;
    }
    const t = setTimeout(() => fetchData(query), 300);
    return () => clearTimeout(t);
  }, [rid, query, fetchData]);

  if (stage === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center max-w-sm">
          <Icon name="TriangleAlert" size={32} className="mx-auto mb-3 text-amber-400" />
          <p className="font-medium mb-1">Не получилось открыть</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={goBack}>Назад</Button>
        </div>
      </div>
    );
  }

  const title = KIND_TITLES[receiving?.kind || ""] || "Приёмка";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goBack}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{title}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {receiving ? dateRu(receiving.work_date) : ""}
              {receiving?.employee_name ? ` · ${receiving.employee_name}` : ""}
            </p>
          </div>
          {deletable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
              title="Удалить приёмку"
              disabled={deleting}
              onClick={() => setAskDelete(true)}
            >
              <Icon name="Trash2" size={17} />
            </Button>
          )}
          <span
            className={`shrink-0 rounded-lg px-2 py-1 text-[11px] ${
              receiving?.closed
                ? "bg-white/[0.06] text-muted-foreground"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {receiving?.closed
              ? receiving.auto_closed
                ? "закрыта автоматически"
                : "закрыта"
              : "открыта"}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-4 flex-1 space-y-4">
        {receiving?.closed && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
              <Icon name="Archive" size={19} className="text-muted-foreground" />
            </div>
            <div className="text-sm">
              <div className="font-medium">Приёмка в архиве</div>
              <div className="text-xs text-muted-foreground">
                {receiving?.auto_closed
                  ? "Закрылась сама в конце суток — кнопку «Закончить» не нажали"
                  : "Смотреть можно, дописать или изменить — нет"}
              </div>
            </div>
          </div>
        )}

        <DailyCounters counters={counters} />

        <div className="relative">
          <Icon
            name="Search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Модель, наименование, штрихкод, заказ-наряд"
            className="pl-9 h-11"
          />
          {busy && (
            <Icon
              name="Loader2"
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
            />
          )}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
            <Icon name="List" size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium flex-1">Проверенный товар</span>
            <span className="text-xs text-muted-foreground">
              {query ? `нашли ${items.length}` : counters.total}
            </span>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                {query ? "Ничего не нашли" : "В этой приёмке ничего не проверено"}
              </p>
            ) : (
              items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => setOpen(it)}
                  className="w-full px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm break-words">{it.tech_name}</div>
                    <div className="text-xs text-muted-foreground break-all">
                      {it.supplier_barcode}
                      {it.warehouse ? ` · ${it.warehouse}` : ""}
                    </div>
                  </div>
                  <Icon
                    name="ChevronRight"
                    size={15}
                    className={`shrink-0 ${RESULT_CLS[it.check_result || ""] || "text-muted-foreground"}`}
                  />
                </button>
              ))
            )}
          </div>
        </div>
      </main>

      {askDelete && receiving && (
        <DeleteDialog
          workDate={receiving.work_date}
          kind={receiving.kind}
          busy={deleting}
          onConfirm={remove}
          onCancel={() => setAskDelete(false)}
        />
      )}

      {open && <ArchiveItemCard item={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default ReceivingArchive;