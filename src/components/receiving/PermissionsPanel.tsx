import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";
import { RECEIVING_PERMS_URL, permHeaders } from "@/hooks/useReceivingPerms";

interface Perm {
  key: string;
  group: string;
  title: string;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
}

interface Person {
  id: number;
  first_name: string | null;
  last_name: string | null;
  role_id: number | null;
  role_name: string | null;
}

interface Matrix {
  perms: Perm[];
  roles: Role[];
  people: Person[];
  role_perms: Record<string, Record<string, boolean>>;
  manager_perms: Record<string, Record<string, boolean>>;
}

const PermissionsPanel = ({ onBack }: { onBack: () => void }) => {
  const { toast } = useToast();
  const [data, setData] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [openRole, setOpenRole] = useState<number | null>(null);
  const [openPerson, setOpenPerson] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`${RECEIVING_PERMS_URL}?action=matrix`, { headers: permHeaders() });
    if (r.status === 403) {
      setDenied(true);
      setLoading(false);
      return;
    }
    const d = await r.json();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (
    target: { role_id?: number; manager_id?: number },
    permKey: string,
    enabled: boolean,
  ) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (target.role_id) {
        next.role_perms = {
          ...prev.role_perms,
          [target.role_id]: { ...(prev.role_perms[target.role_id] || {}), [permKey]: enabled },
        };
      } else if (target.manager_id) {
        next.manager_perms = {
          ...prev.manager_perms,
          [target.manager_id]: {
            ...(prev.manager_perms[target.manager_id] || {}),
            [permKey]: enabled,
          },
        };
      }
      return next;
    });

    const r = await fetch(RECEIVING_PERMS_URL, {
      method: "POST",
      headers: permHeaders(),
      body: JSON.stringify({ action: "set_perm", ...target, perm_key: permKey, enabled }),
    });
    if (!r.ok) {
      toast({ title: "Не удалось сохранить", variant: "destructive" });
      load();
    }
  };

  const resetPerson = async (managerId: number) => {
    await fetch(RECEIVING_PERMS_URL, {
      method: "POST",
      headers: permHeaders(),
      body: JSON.stringify({ action: "reset_person", manager_id: managerId }),
    });
    toast({ title: "Личные настройки убраны — права как у роли" });
    load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Загружаю...</p>;
  }

  if (denied || !data) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-card p-6 text-center">
        <Icon name="Lock" size={28} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Нет доступа к настройке прав</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          Назад
        </Button>
      </div>
    );
  }

  const groups = Array.from(new Set(data.perms.map((p) => p.group)));

  const renderSwitches = (
    values: Record<string, boolean>,
    target: { role_id?: number; manager_id?: number },
    inherited?: Record<string, boolean>,
  ) => (
    <div className="mt-3 space-y-4">
      {groups.map((g) => (
        <div key={g}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{g}</div>
          <div className="space-y-1">
            {data.perms
              .filter((p) => p.group === g)
              .map((p) => {
                const own = values[p.key];
                const isOwn = own !== undefined;
                const value = isOwn ? own : Boolean(inherited?.[p.key]);
                return (
                  <label
                    key={p.key}
                    className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.04] cursor-pointer"
                  >
                    <span className="text-sm flex-1">
                      {p.title}
                      {inherited && isOwn && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          лично
                        </span>
                      )}
                    </span>
                    <Switch
                      checked={value}
                      onCheckedChange={(v) => toggle(target, p.key, Boolean(v))}
                    />
                  </label>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <Icon name="ArrowLeft" size={20} />
        </Button>
        <h2 className="font-semibold">Настройки приёмочных прав</h2>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-card p-4">
        <h3 className="font-medium mb-1">Роли</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Право выдаётся всем сотрудникам роли сразу
        </p>
        <div className="space-y-2">
          {data.roles.map((r) => {
            const values = data.role_perms[r.id] || {};
            const count = Object.values(values).filter(Boolean).length;
            const open = openRole === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-white/[0.08]">
                <button
                  onClick={() => setOpenRole(open ? null : r.id)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {count > 0 ? `${count} разрешений` : "нет доступа"}
                    </div>
                  </div>
                  <Icon name={open ? "ChevronUp" : "ChevronDown"} size={18} />
                </button>
                {open && <div className="px-3 pb-3">{renderSwitches(values, { role_id: r.id })}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-card p-4">
        <h3 className="font-medium mb-1">Сотрудники</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Поверх роли — личные настройки конкретному человеку
        </p>
        <div className="space-y-2">
          {data.people.map((m) => {
            const values = data.manager_perms[m.id] || {};
            const inherited = m.role_id ? data.role_perms[m.role_id] || {} : {};
            const personal = Object.keys(values).length;
            const open = openPerson === m.id;
            const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || "Без имени";
            return (
              <div key={m.id} className="rounded-xl border border-white/[0.08]">
                <button
                  onClick={() => setOpenPerson(open ? null : m.id)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.role_name || "без роли"}
                      {personal > 0 && ` · ${personal} личных`}
                    </div>
                  </div>
                  <Icon name={open ? "ChevronUp" : "ChevronDown"} size={18} />
                </button>
                {open && (
                  <div className="px-3 pb-3">
                    {renderSwitches(values, { manager_id: m.id }, inherited)}
                    {personal > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3 text-amber-300"
                        onClick={() => resetPerson(m.id)}
                      >
                        Вернуть как у роли
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PermissionsPanel;
