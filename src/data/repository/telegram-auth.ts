export const RECIPE_TELEGRAM_AUTH_TITLE = "Авторизация через Telegram + переходы по ролям";

export const RECIPE_TELEGRAM_AUTH = `# Рецепт: Авторизация через Telegram + переходы по ролям

## Привет, Юра!
Это я, Юра из соседнего проекта. Передаю тебе рабочее, обкатанное решение: вход в админ-панель по номеру телефона с подтверждением через Telegram-бота, плюс разделение доступа по ролям (владелец / управленец) и редиректы после входа. Ниже — полный обезличенный код и пояснения. Воссоздай это в своём проекте по шагам. Реальные токены и телефоны я не передаю — их заведёт владелец.

## Что Юра должен спросить у владельца перед внедрением
1. **Имя Telegram-бота** (username, например \`my_shop_bot\`) — нужно для ссылки \`t.me/<bot>?start=...\`.
2. **Токен бота** от @BotFather — положить в секрет \`TELEGRAM_BOT_TOKEN\` (значение вводит владелец сам).
3. **Секрет вебхука** — придумать случайную строку 32–64 символа, положить в \`TELEGRAM_WEBHOOK_SECRET\`.
4. **Кто владелец** — телефон владельца (роль \`owner\` в таблице users). Остальные — управленцы.
5. **Нужны ли роли управленцев** (таблица roles) или хватит одной роли «владелец».
6. **Какой текст и название** на экране входа (заголовок панели).
7. После деплоя бэкенда — **зарегистрировать вебхук** бота на функцию telegram-webhook (см. ниже).

## Как это устроено (схема)
1. Пользователь вводит телефон → фронт зовёт бэкенд \`check_phone\`.
2. Если Telegram не привязан — экран «Привяжите Telegram»: пользователь жмёт кнопку, открывается бот с параметром \`?start=<телефон>\`, пишет боту → вебхук сохраняет \`chat_id\` к телефону.
3. Бэкенд \`send_code\` генерирует 6-значный код, кладёт в \`login_codes\` (живёт 5 минут) и шлёт его в Telegram.
4. \`verify_code\` проверяет код → создаёт сессию (токен на 30 дней) в \`user_sessions\` → возвращает токен + роль.
5. Фронт сохраняет токен и пользователя в localStorage и редиректит по роли: \`owner\` → дашборд, иначе → кабинет управленца.
6. \`ProtectedRoute\` пускает только при наличии токена; эндпоинт \`me\` проверяет сессию по токену.

## Таблицы БД (SQL-миграция)
\`\`\`sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'manager',
    telegram_chat_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(128) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE login_codes (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

-- Опционально, если нужны управленцы с ролями:
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE managers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role_id INTEGER REFERENCES roles(id),
    telegram_chat_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'not_authorized'
);

-- Владелец (телефон подставит владелец):
-- INSERT INTO users (phone, role) VALUES ('+70000000000', 'owner');
\`\`\`

## Секреты (только имена, значения вводит владелец)
- \`DATABASE_URL\` — обычно уже есть в проекте.
- \`TELEGRAM_BOT_TOKEN\` — токен бота от @BotFather.
- \`TELEGRAM_WEBHOOK_SECRET\` — случайная строка для проверки вебхука.

## Бэкенд: функция авторизации (owner-auth/index.py)
\`\`\`python
import json
import os
import secrets
import urllib.request
from datetime import datetime, timedelta
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def check_access(cur, phone):
    cur.execute("SELECT id, role, telegram_chat_id FROM users WHERE phone = %s", (phone,))
    user = cur.fetchone()
    if not user:
        return None, None, None
    if user[1] == 'owner':
        return 'owner', user, None
    cur.execute("SELECT id, status FROM managers WHERE phone = %s", (phone,))
    mgr = cur.fetchone()
    if not mgr:
        return 'denied', user, 'Доступ запрещён. Обратитесь к владельцу.'
    if mgr[1] == 'not_authorized':
        return 'not_authorized', user, 'Привяжите Telegram для продолжения.'
    if mgr[1] == 'pending':
        return 'pending', user, 'Ваш аккаунт ожидает авторизации владельцем.'
    if mgr[1] == 'authorized':
        return 'authorized', user, None
    return 'denied', user, 'Доступ запрещён.'

def handler(event: dict, context) -> dict:
    """Авторизация по телефону: проверка номера, отправка кода в Telegram, проверка кода, выдача сессии"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
            'Access-Control-Max-Age': '86400'}, 'body': ''}

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    body = json.loads(event.get('body') or '{}')

    if method == 'POST' and action == 'check_phone':
        phone = body.get('phone', '').strip()
        if not phone:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Укажите номер телефона'})}
        conn = get_db(); cur = conn.cursor()
        status, user, message = check_access(cur, phone)
        cur.close(); conn.close()
        if status is None:
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'allowed': False, 'error': 'Доступ запрещён. Обратитесь к владельцу.'})}
        if status == 'denied':
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'allowed': False, 'error': message})}
        if status == 'not_authorized':
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'allowed': True, 'need_telegram': True})}
        if status == 'pending':
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'allowed': False, 'error': message})}
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'allowed': True, 'need_telegram': user[2] is None})}

    if method == 'POST' and action == 'check_telegram':
        phone = body.get('phone', '').strip()
        conn = get_db(); cur = conn.cursor()
        cur.execute("SELECT telegram_chat_id FROM users WHERE phone = %s", (phone,))
        row = cur.fetchone()
        cur.close(); conn.close()
        linked = bool(row and row[0])
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'linked': linked})}

    if method == 'POST' and action == 'send_code':
        phone = body.get('phone', '').strip()
        conn = get_db(); cur = conn.cursor()
        status, user, message = check_access(cur, phone)
        if status not in ('owner', 'authorized'):
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': message or 'Доступ запрещён'})}
        if not user[2]:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Telegram не привязан'})}
        code = str(secrets.randbelow(900000) + 100000)
        expires_at = datetime.now() + timedelta(minutes=5)
        cur.execute("DELETE FROM login_codes WHERE phone = %s", (phone,))
        cur.execute("INSERT INTO login_codes (phone, code, expires_at) VALUES (%s, %s, %s)", (phone, code, expires_at))
        conn.commit()
        bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
        if bot_token:
            url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
            payload = json.dumps({'chat_id': user[2], 'text': f'{code} — код авторизации.\\n\\nДействителен 5 минут.'}).encode()
            req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
            try:
                urllib.request.urlopen(req, timeout=10)
            except Exception:
                cur.close(); conn.close()
                return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Не удалось отправить код'})}
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True})}

    if method == 'POST' and action == 'verify_code':
        phone = body.get('phone', '').strip()
        code = body.get('code', '').strip()
        conn = get_db(); cur = conn.cursor()
        status, user, message = check_access(cur, phone)
        if status not in ('owner', 'authorized'):
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': message or 'Доступ запрещён'})}
        cur.execute("SELECT id FROM login_codes WHERE phone = %s AND code = %s AND expires_at > NOW()", (phone, code))
        if not cur.fetchone():
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Неверный или просроченный код'})}
        cur.execute("DELETE FROM login_codes WHERE phone = %s", (phone,))
        token = secrets.token_hex(32)
        expires_at = datetime.now() + timedelta(days=30)
        cur.execute("INSERT INTO user_sessions (user_id, token, expires_at) VALUES (%s, %s, %s)", (user[0], token, expires_at))
        conn.commit()
        user_data = {'id': user[0], 'phone': phone, 'role': status}
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'token': token, 'user': user_data})}

    if method == 'GET' and action == 'me':
        auth = event.get('headers', {}).get('X-Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        if not token:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}
        conn = get_db(); cur = conn.cursor()
        cur.execute("""SELECT u.id, u.phone, u.role FROM users u
                       JOIN user_sessions s ON s.user_id = u.id
                       WHERE s.token = %s AND s.expires_at > NOW()""", (token,))
        user = cur.fetchone()
        cur.close(); conn.close()
        if not user:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Сессия истекла'})}
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'user': {'id': user[0], 'phone': user[1], 'role': user[2]}})}

    return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Неизвестное действие'})}
\`\`\`

## Бэкенд: вебхук Telegram (telegram-webhook/index.py)
Привязывает chat_id к телефону при команде /start. Защищён секретом вебхука.
\`\`\`python
import json
import os
import hmac
import urllib.request
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def send_message(chat_id, text):
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return
    url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
    payload = json.dumps({'chat_id': chat_id, 'text': text}).encode()
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass

def handler(event: dict, context) -> dict:
    """Вебхук Telegram: привязка телефона к chat_id по команде /start <телефон>"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token'}, 'body': ''}
    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}

    expected = os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')
    req_headers = event.get('headers') or {}
    received = ''
    for k, v in req_headers.items():
        if k.lower() == 'x-telegram-bot-api-secret-token':
            received = v or ''
            break
    if not expected or not received or not hmac.compare_digest(received, expected):
        return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Forbidden'})}

    body = json.loads(event.get('body') or '{}')
    message = body.get('message', {})
    text = (message.get('text') or '').strip()
    chat_id = (message.get('chat') or {}).get('id')
    if not chat_id or not text:
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

    if text.startswith('/start'):
        parts = text.split(maxsplit=1)
        if len(parts) == 2:
            phone = parts[1].strip().replace('-', '').replace(' ', '').replace('(', '').replace(')', '')
            if not phone.startswith('+'):
                phone = '+' + phone
            conn = get_db(); cur = conn.cursor()
            cur.execute("SELECT id FROM users WHERE phone = %s", (phone,))
            if cur.fetchone():
                cur.execute("UPDATE users SET telegram_chat_id = %s WHERE phone = %s", (chat_id, phone))
                conn.commit()
                send_message(chat_id, "Telegram привязан к номеру " + phone + ". Теперь можно получать коды авторизации.")
            else:
                send_message(chat_id, "Номер " + phone + " не найден. Обратитесь к администратору.")
            cur.close(); conn.close()
        else:
            send_message(chat_id, "Добро пожаловать! Для привязки используйте кнопку на сайте.")
    return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}
\`\`\`

### Регистрация вебхука бота (выполнить один раз)
Открой в браузере (подставь токен и URL функции telegram-webhook из func2url.json):
\`\`\`
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<URL_ФУНКЦИИ_telegram-webhook>&secret_token=<TELEGRAM_WEBHOOK_SECRET>
\`\`\`

## Фронтенд: страница входа (AdminLogin.tsx)
\`\`\`tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const AUTH_URL = "<URL_ФУНКЦИИ_owner-auth>"; // из func2url.json
const BOT_USERNAME = "<имя_бота>"; // например my_shop_bot

export default function AdminLogin() {
  const [phone, setPhone] = useState("+");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "telegram" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (!value.startsWith("+")) value = "+" + value;
    const cleaned = "+" + value.replace(/[^\\d]/g, "");
    if (cleaned.length <= 16) setPhone(cleaned);
  };

  const openTelegramBot = () => {
    window.open(\`https://t.me/\${BOT_USERNAME}?start=\${phone.replace("+", "")}\`, "_blank");
  };

  const checkPhone = async () => {
    setLoading(true);
    try {
      const resp = await fetch(\`\${AUTH_URL}/?action=check_phone\`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await resp.json();
      if (!data.allowed) { toast({ title: "Доступ запрещён", description: data.error, variant: "destructive" }); return; }
      if (data.need_telegram) { setStep("telegram"); return; }
      await sendCode();
    } finally { setLoading(false); }
  };

  const sendCode = async () => {
    setLoading(true);
    try {
      const resp = await fetch(\`\${AUTH_URL}/?action=send_code\`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await resp.json();
      if (resp.ok) { setStep("code"); toast({ title: "Код отправлен", description: "Проверьте Telegram" }); }
      else toast({ title: "Ошибка", description: data.error, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const checkTelegramLink = async () => {
    const resp = await fetch(\`\${AUTH_URL}/?action=check_telegram\`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await resp.json();
    if (data.linked) { setTelegramLinked(true); toast({ title: "Telegram привязан" }); }
    else toast({ title: "Telegram не привязан", variant: "destructive" });
  };

  const verifyCode = async () => {
    setLoading(true);
    try {
      const resp = await fetch(\`\${AUTH_URL}/?action=verify_code\`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await resp.json();
      if (resp.ok) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        // РЕДИРЕКТ ПО РОЛИ:
        if (data.user.role === "owner") navigate("/admin/dashboard");
        else navigate("/admin/manager");
      } else toast({ title: "Ошибка", description: data.error, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const phoneDigits = phone.replace(/\\D/g, "");
  const isPhoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 15;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-white/[0.08] bg-card p-8">
        <h1 className="text-xl font-semibold text-center mb-6">Вход в панель управления</h1>
        <div className="space-y-4">
          <Input type="tel" placeholder="+7XXXXXXXXXX" value={phone}
            onChange={handlePhoneChange} disabled={step !== "phone"} className="h-11" />

          {step === "phone" && (
            <Button className="w-full h-11" onClick={checkPhone} disabled={!isPhoneValid || loading}>
              {loading ? "Проверка..." : "Продолжить"}
            </Button>
          )}

          {step === "telegram" && (
            <div className="space-y-3">
              <Button variant="outline" className="w-full h-11" onClick={openTelegramBot}>
                <Icon name="Send" size={18} /><span className="ml-2">Привет Telegram</span>
              </Button>
              <Button variant="outline" className="w-full h-11" onClick={checkTelegramLink}>
                Я привязал
              </Button>
              <Button className="w-full h-11" onClick={sendCode} disabled={!telegramLinked || loading}>
                Отправить код в Telegram
              </Button>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-3">
              <Input placeholder="Код из Telegram" value={code}
                onChange={(e) => setCode(e.target.value)} className="h-11 text-center" />
              <Button className="w-full h-11" onClick={verifyCode} disabled={loading}>
                {loading ? "Проверка..." : "Войти"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
\`\`\`

## Фронтенд: защита роутов (ProtectedRoute.tsx)
\`\`\`tsx
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
\`\`\`

### Защита по роли (если нужно ограничить страницу только владельцу)
Внутри страницы в начале компонента:
\`\`\`tsx
const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
if (user.role !== "owner") { navigate("/admin/dashboard"); return null; }
\`\`\`

### Подключение роутов (App.tsx)
\`\`\`tsx
<Route path="/admin" element={<AdminLogin />} />
<Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
<Route path="/admin/manager" element={<ProtectedRoute><ManagerDashboard /></ProtectedRoute>} />
\`\`\`

## Порядок внедрения (чек-лист для Юры)
1. Применить SQL-миграцию (таблицы users, user_sessions, login_codes; при необходимости roles, managers).
2. Завести секреты TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET (значения вводит владелец).
3. Создать бэкенд-функции owner-auth и telegram-webhook, задеплоить, взять их URL.
4. Зарегистрировать вебхук бота (setWebhook) — один раз.
5. Создать фронт: AdminLogin, ProtectedRoute; подставить AUTH_URL и BOT_USERNAME.
6. Прописать роуты в App.tsx, проверить редиректы по ролям.
7. Добавить владельца в users (role='owner') и протестировать вход.

Удачи! Если что-то не сходится с твоим проектом — спроси у владельца ответы из блока «Что Юра должен спросить».`;
