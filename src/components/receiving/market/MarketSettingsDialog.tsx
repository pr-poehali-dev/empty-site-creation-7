import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Icon from "@/components/ui/icon";
import ProxySection from "./ProxySection";
import SiteRow from "./SiteRow";
import VpsSection from "./VpsSection";
import { settingsCall, type MarketSettings, type SiteSetting } from "@/lib/marketPrices";

interface Props {
  open: boolean;
  onClose: () => void;
}

const MarketSettingsDialog = ({ open, onClose }: Props) => {
  const [data, setData] = useState<MarketSettings | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (tag: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(tag);
    setError("");
    setNotice("");
    try {
      const d = await settingsCall(action, extra);
      setData((prev) => (action === "save_site" || action === "test_site" ? { ...d, proxies: prev?.proxies || d.proxies } : d));
      if (d.warning) setNotice(d.warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (open) run("load", "settings");
  }, [open]);

  const patchSite = (s: SiteSetting, patch: Partial<SiteSetting>) => {
    setData((prev) =>
      prev ? { ...prev, sites: prev.sites.map((x) => (x.site === s.site ? { ...x, ...patch } : x)) } : prev,
    );
    run(`site:${s.site}`, "save_site", { site: s.site, ...patch });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Settings" size={18} />
            Настройки цен маркетплейсов
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {notice}
          </div>
        )}

        {!data && busy === "load" && <p className="text-sm text-muted-foreground">Загружаю...</p>}

        {data && (
          <Tabs defaultValue="proxy">
            <TabsList className="w-full">
              <TabsTrigger value="proxy" className="flex-1">
                Настройка прокси
              </TabsTrigger>
              <TabsTrigger value="sites" className="flex-1">
                Маркетплейсы
              </TabsTrigger>
              <TabsTrigger value="vps" className="flex-1">
                Браузерный сервер
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vps" className="mt-3">
              <VpsSection />
            </TabsContent>

            <TabsContent value="proxy" className="space-y-3 mt-3">
              <p className="text-xs text-muted-foreground">
                Через прокси сайты видят запрос как от обычного покупателя из России или Беларуси.
              </p>
              {data.proxies.map((p) => (
                <ProxySection
                  key={p.provider}
                  proxy={p}
                  busy={busy}
                  onSaveKey={(api_key) => run("key", "save_key", { api_key })}
                  onCreate={(recreate) => run("create", "create_proxies", { recreate })}
                />
              ))}
            </TabsContent>

            <TabsContent value="sites" className="space-y-2 mt-3">
              <p className="text-xs text-muted-foreground">
                Выключенный сайт не ищется и его колонка скрыта. Способ: напрямую, через прокси или через
                браузер на своём сервере (для WB и Ozon). «Проверить» ищет тестовую модель и показывает, пустил ли
                сайт. Через браузер поиск идёт 5–25 секунд.
              </p>
              {data.sites.map((s) => (
                <SiteRow
                  key={s.site}
                  s={s}
                  testing={busy === `test:${s.site}`}
                  onSave={(patch) => patchSite(s, patch)}
                  onTest={() => run(`test:${s.site}`, "test_site", { site: s.site })}
                />
              ))}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MarketSettingsDialog;