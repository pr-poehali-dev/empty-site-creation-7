import { useState, useEffect } from "react";

export const RECEIVING_PERMS_URL =
  "https://functions.poehali.dev/dd5813af-28a1-49d8-bd0a-b0ecdf56d75d";

export interface MyPerms {
  is_owner: boolean;
  role_name: string | null;
  authorized?: boolean;
  permissions: Record<string, boolean>;
}

export const permHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

export const useReceivingPerms = () => {
  const [perms, setPerms] = useState<MyPerms | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`${RECEIVING_PERMS_URL}?action=my`, { headers: permHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setPerms(d);
      })
      .catch(() => {
        if (alive) setPerms({ is_owner: false, role_name: null, permissions: {} });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const can = (key: string) => Boolean(perms?.is_owner || perms?.permissions?.[key]);
  const expired = !loading && perms !== null && perms.authorized === false;

  return { perms, loading, can, expired };
};