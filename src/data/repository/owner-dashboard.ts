export const RECIPE_OWNER_DASHBOARD_TITLE = "Минимальный дашборд владельца (управление управленцами)";

export const RECIPE_OWNER_DASHBOARD = `# Рецепт: Минимальный дашборд владельца — управление управленцами

## Привет, Юра!
Это снова я. Передаю «нижний» блок дашборда владельца — раздел сотрудников: владелец видит список управленцев, добавляет их по номеру телефона, задаёт имя/фамилию/роль, может деактивировать (сбросить) или удалить. Код обезличенный: URL функций и токены — плейсхолдеры, секреты только по именам.

> **Важно:** этот рецепт зависит от рецепта «Авторизация через Telegram + переходы по ролям». Сначала внедри его — оттуда берутся таблицы \`users\`, \`user_sessions\` и токен-сессии владельца.

## Что Юра должен спросить у владельца
1. **Какие роли** нужны управленцам в этом проекте (список названий). По умолчанию: Управляющий, Менеджер опта, Менеджер розницы, Продавец.
2. **Нужна ли привязка Telegram** у управленцев (статусы not_authorized → pending → authorized) или достаточно просто добавить номер.
3. **Удалять управленцев полностью** или хватит «деактивации» (сброс данных без удаления записи).
4. Куда встроить блок — отдельной вкладкой дашборда или внизу страницы.

## Как это устроено (статусы)
1. Владелец добавляет номер → создаётся запись управленца в статусе \`not_authorized\` (и пользователь в \`users\` с ролью \`manager\`).
2. Управленец пишет боту /start (см. рецепт авторизации) → привязывает Telegram → статус \`pending\`.
3. Владелец задаёт имя, фамилию и роль → статус \`authorized\`, управленец может входить.
4. Владелец может **редактировать** данные, **деактивировать** (сброс в \`not_authorized\`, очистка имени/роли/Telegram) или **удалить** запись полностью.
5. Доступ к разделу — только у владельца (роль \`owner\`, проверка по токену сессии).

## Таблицы БД (SQL-миграция)
\`\`\`sql
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

INSERT INTO roles (name) VALUES
  ('Управляющий'),
  ('Менеджер опта'),
  ('Менеджер розницы'),
  ('Продавец');

CREATE TABLE managers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role_id INTEGER REFERENCES roles(id),
    telegram_chat_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'not_authorized',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
\`\`\`

## Секреты (только имена)
- \`DATABASE_URL\` — подключение к БД (обычно уже есть).

## Бэкенд: управление управленцами (admin-managers/index.py)
\`\`\`python
import json
import os
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_owner_by_token(cur, token):
    cur.execute(
        """SELECT u.id, u.phone FROM users u
           JOIN user_sessions s ON s.user_id = u.id
           WHERE s.token = %s AND s.expires_at > NOW() AND u.role = 'owner'""",
        (token,)
    )
    return cur.fetchone()

def handler(event: dict, context) -> dict:
    """Управление управленцами: список, добавление, редактирование, деактивация/удаление"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
            'Access-Control-Max-Age': '86400'}, 'body': ''}

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')

    req_headers = event.get('headers', {})
    auth = req_headers.get('X-Authorization', '') or req_headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()

    conn = get_db(); cur = conn.cursor()
    owner = get_owner_by_token(cur, token)
    if not owner:
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

    if method == 'GET':
        status_filter = params.get('status')
        if status_filter:
            cur.execute("""SELECT m.id, m.phone, m.telegram_chat_id, m.first_name, m.last_name,
                                  r.id, r.name, m.status, m.created_at
                           FROM managers m LEFT JOIN roles r ON r.id = m.role_id
                           WHERE m.status = %s ORDER BY m.created_at DESC""", (status_filter,))
        else:
            cur.execute("""SELECT m.id, m.phone, m.telegram_chat_id, m.first_name, m.last_name,
                                  r.id, r.name, m.status, m.created_at
                           FROM managers m LEFT JOIN roles r ON r.id = m.role_id
                           ORDER BY m.created_at DESC""")
        rows = cur.fetchall()
        managers = [{
            'id': r[0], 'phone': r[1], 'telegram_linked': r[2] is not None,
            'first_name': r[3], 'last_name': r[4],
            'role': {'id': r[5], 'name': r[6]} if r[5] else None,
            'status': r[7], 'created_at': r[8].isoformat() if r[8] else None
        } for r in rows]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'managers': managers})}

    if method == 'POST':
        phone = body.get('phone', '').strip()
        if not phone:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите номер телефона'})}
        cur.execute("SELECT id FROM managers WHERE phone = %s", (phone,))
        if cur.fetchone():
            cur.close(); conn.close()
            return {'statusCode': 409, 'headers': headers, 'body': json.dumps({'error': 'Управленец с таким номером уже существует'})}
        cur.execute("SELECT id FROM users WHERE phone = %s", (phone,))
        if not cur.fetchone():
            cur.execute("INSERT INTO users (phone, role) VALUES (%s, 'manager')", (phone,))
        cur.execute("INSERT INTO managers (phone, status) VALUES (%s, 'not_authorized') RETURNING id, phone, status", (phone,))
        row = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'manager': {'id': row[0], 'phone': row[1], 'status': row[2]}})}

    if method == 'PUT':
        manager_id = params.get('id')
        first_name = body.get('first_name', '').strip()
        last_name = body.get('last_name', '').strip()
        role_id = body.get('role_id')
        if not manager_id or not first_name or not last_name or not role_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id, имя, фамилию и роль'})}
        cur.execute("SELECT id FROM roles WHERE id = %s", (role_id,))
        if not cur.fetchone():
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Роль не найдена'})}
        cur.execute("""UPDATE managers SET first_name = %s, last_name = %s, role_id = %s, status = 'authorized'
                       WHERE id = %s AND status IN ('pending', 'authorized')
                       RETURNING id, phone, first_name, last_name, status""",
                    (first_name, last_name, role_id, manager_id))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Управленец не найден или не в подходящем статусе'})}
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'manager': {'id': row[0], 'phone': row[1], 'first_name': row[2], 'last_name': row[3], 'status': row[4]}})}

    if method == 'DELETE':
        manager_id = params.get('id')
        action = params.get('action', 'deactivate')
        if not manager_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите id управленца'})}
        cur.execute("SELECT phone FROM managers WHERE id = %s", (int(manager_id),))
        mgr = cur.fetchone()
        if not mgr:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Управленец не найден'})}
        if action == 'remove':
            phone = mgr[0]
            cur.execute("DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE phone = %s AND role = 'manager')", (phone,))
            cur.execute("DELETE FROM managers WHERE id = %s", (int(manager_id),))
            cur.execute("DELETE FROM users WHERE phone = %s AND role = 'manager'", (phone,))
        else:
            cur.execute("""UPDATE managers SET status = 'not_authorized', telegram_chat_id = NULL,
                           first_name = NULL, last_name = NULL, role_id = NULL WHERE id = %s""", (int(manager_id),))
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True})}

    cur.close(); conn.close()
    return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Not found'})}
\`\`\`

## Фронтенд: блок «Управленцы» для дашборда владельца
Зависимости (shadcn/ui): Button, Input, Badge, Dialog, Select. Иконки — через компонент Icon.
\`\`\`tsx
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const MANAGERS_URL = "<URL_ФУНКЦИИ_admin-managers>"; // из func2url.json

const ROLES = [
  { id: 1, name: "Управляющий" },
  { id: 2, name: "Менеджер опта" },
  { id: 3, name: "Менеджер розницы" },
  { id: 4, name: "Продавец" },
];

interface Manager {
  id: number;
  phone: string;
  telegram_linked: boolean;
  first_name: string | null;
  last_name: string | null;
  role: { id: number; name: string } | null;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  not_authorized: "Не привязан",
  pending: "Ожидает авторизации",
  authorized: "Активен",
};

export default function ManagersBlock() {
  const token = localStorage.getItem("auth_token") || "";
  const { toast } = useToast();
  const authHeaders = { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` };

  const [managers, setManagers] = useState<Manager[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("+");
  const [editManager, setEditManager] = useState<Manager | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRoleId, setEditRoleId] = useState("");

  const fetchManagers = useCallback(async () => {
    const resp = await fetch(MANAGERS_URL, { headers: authHeaders });
    const data = await resp.json();
    if (resp.ok) setManagers(data.managers || []);
  }, [token]);

  useEffect(() => { fetchManagers(); }, []);

  const addManager = async () => {
    const resp = await fetch(MANAGERS_URL, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ phone: newPhone }),
    });
    const data = await resp.json();
    if (resp.ok) { toast({ title: "Управленец добавлен" }); setAddOpen(false); setNewPhone("+"); fetchManagers(); }
    else toast({ title: "Ошибка", description: data.error, variant: "destructive" });
  };

  const openEdit = (m: Manager) => {
    setEditManager(m);
    setEditFirstName(m.first_name || "");
    setEditLastName(m.last_name || "");
    setEditRoleId(m.role ? String(m.role.id) : "");
  };

  const saveEdit = async () => {
    if (!editManager) return;
    const resp = await fetch(\`\${MANAGERS_URL}?id=\${editManager.id}\`, {
      method: "PUT", headers: authHeaders,
      body: JSON.stringify({ first_name: editFirstName.trim(), last_name: editLastName.trim(), role_id: Number(editRoleId) }),
    });
    const data = await resp.json();
    if (resp.ok) { toast({ title: "Данные обновлены" }); setEditManager(null); fetchManagers(); }
    else toast({ title: "Ошибка", description: data.error, variant: "destructive" });
  };

  const deactivate = async (m: Manager) => {
    const resp = await fetch(\`\${MANAGERS_URL}?id=\${m.id}\`, { method: "DELETE", headers: authHeaders });
    if (resp.ok) { toast({ title: "Деактивирован" }); fetchManagers(); }
  };

  const remove = async (m: Manager) => {
    const resp = await fetch(\`\${MANAGERS_URL}?id=\${m.id}&action=remove\`, { method: "DELETE", headers: authHeaders });
    if (resp.ok) { toast({ title: "Удалён" }); fetchManagers(); }
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Управленцы</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Icon name="Plus" size={16} /><span className="ml-1">Добавить</span>
        </Button>
      </div>

      <div className="space-y-2">
        {managers.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] p-3">
            <div>
              <p className="font-medium">
                {m.first_name || m.last_name ? \`\${m.first_name || ""} \${m.last_name || ""}\` : m.phone}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{m.phone}</span>
                {m.role && <span>· {m.role.name}</span>}
                <Badge variant="outline">{STATUS_LABEL[m.status] || m.status}</Badge>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => openEdit(m)}><Icon name="Pencil" size={16} /></Button>
              <Button size="sm" variant="ghost" onClick={() => deactivate(m)}><Icon name="UserMinus" size={16} /></Button>
              <Button size="sm" variant="ghost" onClick={() => remove(m)}><Icon name="Trash2" size={16} /></Button>
            </div>
          </div>
        ))}
        {managers.length === 0 && <p className="text-sm text-muted-foreground">Управленцев пока нет</p>}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Добавить управленца</DialogTitle></DialogHeader>
          <Input value={newPhone} placeholder="+7XXXXXXXXXX"
            onChange={(e) => { let v = e.target.value; if (!v.startsWith("+")) v = "+" + v; setNewPhone("+" + v.replace(/[^\\d]/g, "")); }} />
          <DialogFooter>
            <Button onClick={addManager}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editManager} onOpenChange={(o) => !o && setEditManager(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Редактировать управленца</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Имя" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
            <Input placeholder="Фамилия" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
            <Select value={editRoleId} onValueChange={setEditRoleId}>
              <SelectTrigger><SelectValue placeholder="Выберите роль" /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={saveEdit}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
\`\`\`

### Как встроить
Импортируй блок на странице дашборда владельца и помести внизу:
\`\`\`tsx
import ManagersBlock from "@/components/ManagersBlock";
// ...внизу дашборда:
<ManagersBlock />
\`\`\`

## Порядок внедрения (чек-лист для Юры)
1. Убедиться, что внедрён рецепт авторизации (таблицы users, user_sessions, токены).
2. Применить SQL-миграцию (roles + сидинг ролей, managers).
3. Создать бэкенд-функцию admin-managers, задеплоить, взять URL.
4. Создать фронт-компонент ManagersBlock, подставить MANAGERS_URL и нужные роли.
5. Встроить блок внизу дашборда владельца.
6. Проверить: добавление номера → привязка Telegram управленцем → задание роли → редактирование/деактивация/удаление.

Готово! Если роли в проекте другие — поправь массив ROLES на фронте и сидинг в SQL по ответам владельца.`;
