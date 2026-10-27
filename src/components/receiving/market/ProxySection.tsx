import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import PasswordInput from "@/components/ui/password-input";
import { mb, type ProxyInfo } from "@/lib/marketPrices";

interface Props {
  proxy: ProxyInfo;
  busy: string;
  onSaveKey: (key: string) => void;
  onCreate: (recreate: boolean) => void;
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-3 text-sm py-1">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right">{children}</span>
  </div>
);

const ProxySection = ({ proxy, busy, onSaveKey, onCreate }: Props) => {
  const [key, setKey] = useState("");
  const pkg = proxy.package;
  const mob = proxy.mobile_package;
  const expires = pkg?.expires_at ? new Date(pkg.expires_at * 1000).toLocaleDateString("ru-RU") : "—";
  const left = pkg?.total != null ? pkg.total - (pkg.used || 0) : null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-background/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="Globe" size={18} className="text-violet-300" />
        <span className="font-medium flex-1">{proxy.title}</span>
        {proxy.has_key ? (
          <span className="text-xs rounded-full bg-emerald-500/15 text-emerald-200 px-2 py-0.5">
            ключ {proxy.key_mask}
          </span>
        ) : (
          <span className="text-xs rounded-full bg-amber-500/15 text-amber-200 px-2 py-0.5">нет ключа</span>
        )}
      </div>

      <div className="flex gap-2">
        <PasswordInput
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={proxy.has_key ? "Новый API-ключ" : "API-ключ Proxy.Market"}
          className="h-9"
        />
        <Button
          size="sm"
          className="h-9"
          disabled={!key.trim() || busy === "key"}
          onClick={() => {
            onSaveKey(key.trim());
            setKey("");
          }}
        >
          {busy === "key" ? <Icon name="Loader2" size={14} className="animate-spin" /> : "Сохранить"}
        </Button>
      </div>

      {proxy.error && <p className="text-sm text-red-300">{proxy.error}</p>}

      {proxy.has_key && (
        <div className="divide-y divide-white/[0.06]">
          <Row label="Баланс">{proxy.balance != null ? `${proxy.balance} ₽` : "—"}</Row>
          <Row label="Пакет трафика">{pkg ? pkg.name : "нет активного пакета"}</Row>
          {pkg && (
            <>
              <Row label="Куплено / потрачено">
                {mb(pkg.total)} / {mb(pkg.used)}
              </Row>
              <Row label="Осталось">{left != null ? mb(left) : "без лимита"}</Row>
              <Row label="Действует до">{expires}</Row>
            </>
          )}
          <Row label="Прокси Россия">
            {proxy.proxy_ru ? <span className="text-emerald-300">создан</span> : <span className="text-amber-300">нет</span>}
          </Row>
          <Row label="Прокси Беларусь">
            {proxy.proxy_by ? <span className="text-emerald-300">создан</span> : <span className="text-amber-300">нет</span>}
          </Row>
          <Row label="Мобильный пакет (Ozon)">
            {mob ? (
              <span>
                осталось {mob.total != null ? mb(mob.total - (mob.used || 0)) : "без лимита"} из {mb(mob.total)}
              </span>
            ) : (
              <span className="text-amber-300">нет — Ozon не пустит</span>
            )}
          </Row>
          <Row label="Мобильные прокси">
            {proxy.proxy_ru_mobile || proxy.proxy_by_mobile ? (
              <span className="text-emerald-300">
                {[proxy.proxy_ru_mobile && "Россия", proxy.proxy_by_mobile && "Беларусь"].filter(Boolean).join(", ")}
              </span>
            ) : (
              <span className="text-amber-300">нет</span>
            )}
          </Row>
        </div>
      )}

      {proxy.has_key && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy === "create"}
            onClick={() => onCreate(false)}
          >
            {busy === "create" && <Icon name="Loader2" size={14} className="mr-1 animate-spin" />}
            {proxy.proxy_ru && proxy.proxy_by ? "Обновить доступ" : "Создать прокси"}
          </Button>
          {proxy.proxy_ru && proxy.proxy_by && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={busy === "create"}
              onClick={() => onCreate(true)}
            >
              Пересоздать
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProxySection;