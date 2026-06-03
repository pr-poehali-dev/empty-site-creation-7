const BACKUP_URL = "https://functions.poehali.dev/c375160e-7f3d-4231-840d-29e6b5270e1b";

export interface BackupSettings {
  auto_enabled: boolean;
  mode: "daily" | "interval";
  interval_minutes: number;
  daily_every_days: number;
  daily_time: string;
  timezone: string;
  retention_days: number;
  retention_count: number;
  function_timeout_sec: number;
  last_backup_at: string | null;
}

export interface BackupItem {
  id: number;
  created_at: string;
  size_bytes: number;
  tables_count: number;
  rows_count: number;
  type: string;
  is_protected: boolean;
  note: string | null;
  status: string;
  error_message: string | null;
  duration_sec: number;
}

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

const call = async (action: string, method: "GET" | "POST", payload?: object) => {
  const url = method === "GET" ? `${BACKUP_URL}?action=${action}` : BACKUP_URL;
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: method === "POST" ? JSON.stringify({ action, ...payload }) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка");
  return data;
};

export const backupApi = {
  getSettings: (): Promise<{ settings: BackupSettings }> => call("get_settings", "GET"),
  saveSettings: (settings: BackupSettings) => call("save_settings", "POST", { settings }),
  list: (): Promise<{ common: BackupItem[]; protected: BackupItem[] }> => call("list", "GET"),
  create: (is_protected: boolean, note?: string) =>
    call("create", "POST", { is_protected, note }),
  restore: (backup_id: number) => call("restore", "POST", { backup_id }),
  remove: (backup_id: number) => call("delete", "POST", { backup_id }),
};

export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
};

export const typeLabel = (t: string) => {
  if (t === "auto") return "Авто";
  if (t === "manual") return "Ручной";
  if (t === "pre_restore") return "Перед откатом";
  return t;
};
