import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import DebugBadge from "@/components/DebugBadge";
import MODULE_CODE from "@/data/module-form-code";
import scannerJournal from "@/data/journal/scanner.md?raw";

const JOURNAL_TABS = [
  { key: "scanner", label: "Сканер штрихкодов", content: scannerJournal },
];

const TAB_CREATION = `# Создание обработки ОбменССайтом

## 1. Создать внешнюю обработку
Файл → Новый → Внешняя обработка → Имя: \`ОбменССайтом\`

## 2. Реквизиты обработки
Правой кнопкой по «Реквизиты» → Добавить:
- \`АдресСервера\` (Строка, 500)
- \`КлючAPI\` (Строка, 100)

## 3. Табличные части
Правой кнопкой по «Табличные части» → Добавить. Для каждой — добавить колонки:

**СопоставлениеПолей:**
- \`ПолеСайта\` (Строка, 100)
- \`ОписаниеПоля\` (Строка, 200)
- \`Обязательное\` (Булево)
- \`РеквизитНоменклатуры\` (Строка, 200)

**СопоставлениеЦен:**
- \`ВидЦеныСайта\` (Строка, 100)
- \`ОписаниеЦены\` (Строка, 200)
- \`ТипЦен1С\` (СправочникСсылка.ВидыЦен)

**ТоварыДляВыгрузки:**
- \`Номенклатура\` (СправочникСсылка.Номенклатура)
- \`ИдСайта\` (Число, 10, 0)
- \`Выгружать\` (Булево)

**ТоварыССайта:**
- \`ИдСайта\` (Число, 10, 0)
- \`ВнешнийИд\` (Строка, 50)
- \`Наименование\` (Строка, 300)
- \`Артикул\` (Строка, 100)
- \`Бренд\` (Строка, 150)
- \`КодПоставщика\` (Строка, 100)
- \`Категория\` (Строка, 200)
- \`ЦенаБазовая\` (Число, 12, 2)
- \`ЦенаРозница\` (Число, 12, 2)
- \`ЦенаОпт\` (Число, 12, 2)
- \`ЦенаЗакупка\` (Число, 12, 2)
- \`Загружать\` (Булево)

**ШаблонРеквизитов:**
- \`ИмяРеквизита\` (Строка, 200)
- \`Представление\` (Строка, 200)
- \`ТипРеквизита\` (Строка, 200)
- \`ЗначениеПоУмолчанию\` (Строка, 500)

**Отборы:**
- \`ИмяПоля\` (Строка, 200)
- \`ВидСравнения\` (Строка, 50)
- \`Значение\` (Строка, 500)

## 4. Создание формы

### 4.1. Создание формы
1. В дереве обработки раскрыть \`ОбменССайтом\`
2. Правой кнопкой по **Формы** → **Добавить**
3. Тип: **Форма обработки** → **Готово**

### 4.2. Создание вкладок
1. Выделить корень **Форма** в дереве элементов (левая верхняя панель)
2. **Добавить** (зелёный плюс) → **Группа — Страницы**. Имя: \`Страницы\`
3. Выделить \`Страницы\` → **Добавить** → **Группа — Страница**. Имя: \`СтраницаСопоставление\`, Заголовок: \`Сопоставление\`
4. Повторить для \`СтраницаВыгрузка\` (Заголовок: \`Выгрузка\`)
5. Повторить для \`СтраницаЗагрузка\` (Заголовок: \`Загрузка\`)

### 4.3. Вкладка «Сопоставление»

**Поля ввода:**
1. Выделить \`СтраницаСопоставление\` → **Добавить** → **Поле ввода** → ПутьКДанным: \`Объект.АдресСервера\`
2. Повторить для \`Объект.КлючAPI\`

**Кнопка «Загрузить структуру сайта»:**
1. Внизу формы → вкладка **Команды** → **Команды формы** → **Добавить**
2. Имя: \`ЗагрузитьСтруктуруСайта\`, Заголовок: \`Загрузить структуру сайта\`
3. В свойствах команды → **Действие** → лупа → **Создать на клиенте** → **ОК**
4. В дереве элементов: выделить \`СтраницаСопоставление\` → **Добавить** → **Кнопка** → выбрать команду \`ЗагрузитьСтруктуруСайта\`

**Таблицы:**
1. Выделить \`СтраницаСопоставление\` → **Добавить** → **Таблица** → \`Объект.СопоставлениеПолей\` → все колонки
2. Повторить для \`Объект.СопоставлениеЦен\`

**Настройка колонки РеквизитНоменклатуры:**
1. В дереве раскрыть таблицу СопоставлениеПолей → выделить колонку \`РеквизитНоменклатуры\`
2. В свойствах: **РежимВыбораИзСписка** = Истина

### 4.4. Вкладка «Выгрузка»

**Таблица Отборы** (добавить первой):
1. Выделить \`СтраницаВыгрузка\` → **Добавить** → **Таблица** → \`Объект.Отборы\` → все колонки
2. Колонка \`ИмяПоля\`: **РежимВыбораИзСписка** = Истина
3. Колонка \`ВидСравнения\`: **РежимВыбораИзСписка** = Истина, в **СписокВыбора** добавить: Равно, Не равно, Больше, Меньше, Содержит, В группе
4. Колонка \`Значение\`: в свойствах → **КнопкаВыбора** = Истина. Событие **НачалоВыбора** → создать обработчик на клиенте (\`ОтборыЗначениеНачалоВыбора\`). Событие **ОбработкаВыбора** → создать обработчик на клиенте (\`ОтборыЗначениеОбработкаВыбора\`). Код обработчиков уже есть в модуле — при «В группе» откроется форма выбора групп номенклатуры

**Команды и кнопки** (создать аналогично п. 4.3):

| Команда | Заголовок кнопки |
|---|---|
| \`ЗаполнитьСписокТоваров\` | Заполнить список |
| \`ВыгрузитьНаСайт\` | Выгрузить на сайт |
| \`СвязатьССайтом\` | Связать с сайтом |

**Таблица ТоварыДляВыгрузки:**
1. \`Объект.ТоварыДляВыгрузки\` → колонки: Номенклатура, ИдСайта, Выгружать

Порядок сверху вниз: Отборы → кнопка «Заполнить список» → таблица товаров → кнопки «Выгрузить» и «Связать»

### 4.5. Вкладка «Загрузка»

**Команды и кнопки:**

| Команда | Заголовок кнопки |
|---|---|
| \`ЗагрузитьССайта\` | Загрузить с сайта |
| \`СоздатьНоменклатуру\` | Создать номенклатуру |
| \`УстановитьЦены\` | Установить цены |

**Таблицы:**
1. \`Объект.ТоварыССайта\` → все колонки
2. \`Объект.ШаблонРеквизитов\` → колонки: Представление, ТипРеквизита, ЗначениеПоУмолчанию

Порядок: кнопка «Загрузить с сайта» → таблица товаров → таблица шаблона → кнопки «Создать номенклатуру» и «Установить цены»

### 4.6. Поле Лог (под вкладками)
1. Вкладка **Реквизиты** формы (правая верхняя панель) → **Добавить** → Имя: \`Лог\`, Тип: \`Строка\` (неограниченная длина)
2. В дереве элементов выделить корень **Форма** (не страницу!) → **Добавить** → **Поле ввода** → ПутьКДанным: \`Лог\`
3. Свойства: **ТолькоПросмотр** = Истина, **МногострочныйРежим** = Истина, **Высота** = 5
4. Если элемент попал внутрь страницы — перетащить мышью ниже группы \`Страницы\`

## 5. Модуль формы
Перейти на вкладку **«Текст модуля»** на этой странице → скопировать весь код → вставить в Модуль формы обработки`;

const TAB_USAGE = `# Инструкция пользования обработкой

## Подготовка
1. Сохранить обработку: Файл → Сохранить как → \`ОбменССайтом.epf\`
2. Открыть в 1С:УНФ: Файл → Открыть → выбрать \`ОбменССайтом.epf\`
3. Заполнить **Адрес сервера** — URL API (из раздела «Обмен с 1С» на сайте)
4. Заполнить **Ключ API** — ключ авторизации (из того же раздела)

## Шаг 1. Загрузка структуры сайта
1. Вкладка **Сопоставление** → кнопка **Загрузить структуру сайта**
2. Заполнятся таблицы полей товаров и видов цен
3. Проверьте лог — должно быть сообщение об успехе

## Шаг 2. Сопоставление полей
1. В таблице **СопоставлениеПолей** — для каждой строки выберите реквизит номенклатуры 1С из выпадающего списка
2. Обязательные поля (колонка «Обязательное» = Да) должны быть заполнены
3. Поле \`product_group\` (Группа) — записывается автоматически из Родителя номенклатуры, сопоставлять не нужно
4. В таблице **СопоставлениеЦен** — для каждого вида цены выберите тип цен из справочника 1С

## Шаг 3. Выгрузка товаров на сайт
1. Перейти на вкладку **Выгрузка**
2. При необходимости заполнить таблицу **Отборы** — фильтры для выбора номенклатуры:
- **ИмяПоля** — какой реквизит фильтровать (выбирается из списка)
- **ВидСравнения** — тип сравнения (Равно, Не равно, Больше, Меньше, Содержит, В группе)
- **Значение** — искомое значение
- Пример: ИмяПоля = «Родитель», ВидСравнения = «В группе», Значение = «Бытовая техника» — выгрузит всю номенклатуру из группы
3. Нажать **Заполнить список** — таблица заполнится номенклатурой (с учётом отборов)
4. Отметить галочкой **Выгружать** нужные товары
5. Нажать **Выгрузить на сайт**
6. После успешной выгрузки в колонке **ИдСайта** появятся идентификаторы товаров
7. Нажать **Связать с сайтом** — сохранит связку для будущих обменов

## Шаг 4. Загрузка товаров с сайта
1. Перейти на вкладку **Загрузка** → нажать **Загрузить с сайта**
2. Таблица заполнится товарами с сайта
3. Отметить галочкой **Загружать** нужные товары
4. При необходимости заполнить **Шаблон реквизитов** — значения по умолчанию
5. Нажать **Создать номенклатуру** — в 1С создадутся новые элементы справочника
6. Нажать **Установить цены** — цены запишутся через документ «Установка цен номенклатуры»

## Типичные ошибки
- **«Ошибка авторизации»** — проверьте правильность ключа API
- **«Не удалось подключиться»** — проверьте адрес сервера, должен начинаться с https://
- **«Обязательное поле не сопоставлено»** — заполните все обязательные поля на вкладке Сопоставление
- **Пустая таблица после «Заполнить список»** — проверьте отборы; убедитесь что номенклатура есть
- **Цены не выгружаются** — проверьте сопоставление цен; подробности ошибок в логе

## Особенности текущей версии
- Группа номенклатуры (Родитель) записывается в поле **Группа** товара, а не в категорию сайта
- Все товары при выгрузке попадают в категорию «Без категории» (временно)
- UUID товара из 1С сохраняется на сайте и виден в карточке товара`;

const renderMarkdown = (text: string) => {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let i = 0;
  let key = 0;

  const renderInline = (line: string) => {
    const parts: (string | JSX.Element)[] = [];
    let remaining = line;
    let partKey = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/`(.+?)`/);

      let firstMatch: { index: number; length: number; type: string; content: string } | null = null;

      if (boldMatch && boldMatch.index !== undefined) {
        firstMatch = { index: boldMatch.index, length: boldMatch[0].length, type: "bold", content: boldMatch[1] };
      }
      if (codeMatch && codeMatch.index !== undefined) {
        if (!firstMatch || codeMatch.index < firstMatch.index) {
          firstMatch = { index: codeMatch.index, length: codeMatch[0].length, type: "code", content: codeMatch[1] };
        }
      }

      if (!firstMatch) {
        parts.push(remaining);
        break;
      }

      if (firstMatch.index > 0) {
        parts.push(remaining.substring(0, firstMatch.index));
      }

      if (firstMatch.type === "bold") {
        parts.push(<strong key={partKey++} className="font-semibold text-foreground">{firstMatch.content}</strong>);
      } else {
        parts.push(<code key={partKey++} className="px-1.5 py-0.5 rounded bg-white/[0.08] text-sm font-mono text-orange-300">{firstMatch.content}</code>);
      }

      remaining = remaining.substring(firstMatch.index + firstMatch.length);
    }

    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      elements.push(<h1 key={key++} className="text-2xl font-bold mt-8 mb-4 text-foreground">{renderInline(line.slice(2))}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="text-xl font-bold mt-8 mb-3 text-foreground border-b border-white/[0.08] pb-2">{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="text-lg font-semibold mt-6 mb-2 text-foreground">{renderInline(line.slice(4))}</h3>);
    } else if (line.startsWith("#### ")) {
      elements.push(<h4 key={key++} className="text-base font-semibold mt-5 mb-2 text-blue-300">{renderInline(line.slice(5))}</h4>);
    } else if (line.startsWith("| ") && lines[i + 1]?.startsWith("|---")) {
      const headers = line.split("|").filter(Boolean).map(h => h.trim());
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].startsWith("| ")) {
        rows.push(lines[i].split("|").filter(Boolean).map(c => c.trim()));
        i++;
      }
      elements.push(
        <div key={key++} className="overflow-x-auto my-3">
          <table className="w-full text-sm border border-white/[0.08] rounded-lg">
            <thead>
              <tr className="bg-white/[0.04]">
                {headers.map((h, hi) => <th key={hi} className="px-3 py-2 text-left font-medium text-muted-foreground border-b border-white/[0.08]">{renderInline(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-white/[0.06]">
                  {row.map((cell, ci) => <td key={ci} className="px-3 py-2">{renderInline(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="list-decimal list-inside space-y-1.5 my-2 ml-1 text-sm text-muted-foreground">
          {listItems.map((item, li) => <li key={li}>{renderInline(item)}</li>)}
        </ol>
      );
      continue;
    } else if (line.startsWith("- ")) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        listItems.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 ml-1 text-sm text-muted-foreground">
          {listItems.map((item, li) => <li key={li}>{renderInline(item)}</li>)}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      // skip
    } else {
      elements.push(<p key={key++} className="text-sm text-muted-foreground my-1.5">{renderInline(line)}</p>);
    }

    i++;
  }

  return elements;
};

const TAB_HOSTING = `# Перенос сайта на свой хостинг

## 1. Скачать код
Скачать → Скачать код (исходники React) или Скачать → Скачать билд (готовый HTML+JS+CSS). Либо подключить GitHub: Скачать → Подключить GitHub.

## 2. Фронтенд (сайт)
- Любой хостинг со статикой: VPS с Nginx, Vercel, Netlify, обычный shared-хостинг
- Собрать билд: \`npm install && npm run build\` → папку \`dist\` закинуть на сервер
- Настроить, чтобы все URL отдавали \`index.html\` (SPA-роутинг)

## 3. Бэкенд (функции)
Python-функции находятся в папке \`/backend/\`. Варианты:
- **Самый простой** — обернуть каждую функцию в Flask/FastAPI на VPS
- Каждая функция принимает \`event\` (httpMethod, headers, body, queryStringParameters) и возвращает \`{statusCode, headers, body}\`
- Нужно будет поменять URL-ы вызовов в фронтенде (сейчас они берутся из \`func2url.json\`)

## 4. База данных
- PostgreSQL — развернуть на своём сервере или взять managed (Supabase, Neon, любой VPS)
- Применить все миграции из папки \`db_migrations/\` по порядку
- Прописать \`DATABASE_URL\` в переменные окружения бэкенда

## 5. Хранилище файлов (S3)
- Любой S3-совместимый сервис: MinIO на своём сервере, Yandex Object Storage, AWS S3
- Прописать \`AWS_ACCESS_KEY_ID\` и \`AWS_SECRET_ACCESS_KEY\`
- Поменять \`endpoint_url\` в коде бэкенда на свой

## 6. Секреты (переменные окружения)
Все ключи, которые сейчас в секретах платформы, нужно прописать как ENV-переменные на своём сервере. Список можно посмотреть в Ядро → Секреты.

## 7. Домен + SSL
- Направить домен на свой сервер
- Let's Encrypt / Cloudflare для SSL

## Минимальный набор
VPS за 500-1000Br/мес + PostgreSQL + Nginx + Python. Всё поместится на одном сервере.`;

const TAB_PLANS = `# Планы

- Создание Нового товара отдельная страница`;

const Instructions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const [section, setSection] = useState<"menu" | "1c" | "hosting" | "journal" | "plans">("menu");
  const [activeTab, setActiveTab] = useState("creation");
  const [journalTab, setJournalTab] = useState(JOURNAL_TABS[0]?.key || "");

  if (user.role !== "owner") {
    navigate("/admin");
    return null;
  }

  const tabs1c = [
    { key: "creation", label: "Создание обработки" },
    { key: "code", label: "Текст модуля" },
    { key: "usage", label: "Инструкция пользования" },
  ];

  const handleCopyCode = () => {
    navigator.clipboard.writeText(MODULE_CODE).then(() => {
      toast({ title: "Код скопирован" });
    });
  };

  const sectionTitle =
    section === "1c"
      ? "Обмен с 1С"
      : section === "hosting"
      ? "Перенос сайта"
      : section === "journal"
      ? "Журнал проекта"
      : section === "plans"
      ? "Планы"
      : "Инструкции от Юры";

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-white/[0.06]"
              onClick={() => section === "menu" ? navigate("/admin/dashboard") : setSection("menu")}
            >
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg sm:text-xl font-semibold">{sectionTitle}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {section === "menu" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => setSection("1c")}
              className="rounded-xl border border-white/[0.08] bg-card p-6 text-left hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Icon name="RefreshCw" size={20} className="text-primary" />
                </div>
                <span className="text-lg font-semibold">Обмен с 1С</span>
              </div>
              <p className="text-sm text-muted-foreground">Создание обработки, модуль формы и инструкция по использованию</p>
            </button>
            <button
              onClick={() => setSection("hosting")}
              className="rounded-xl border border-white/[0.08] bg-card p-6 text-left hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Icon name="Server" size={20} className="text-blue-400" />
                </div>
                <span className="text-lg font-semibold">Перенос сайта</span>
              </div>
              <p className="text-sm text-muted-foreground">Как перенести проект на свой хостинг: фронт, бэк, БД, S3</p>
            </button>
            <button
              onClick={() => setSection("journal")}
              className="rounded-xl border border-white/[0.08] bg-card p-6 text-left hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Icon name="BookOpen" size={20} className="text-emerald-400" />
                </div>
                <span className="text-lg font-semibold">Журнал проекта</span>
              </div>
              <p className="text-sm text-muted-foreground">История работы с Юрой по блокам сайта — что обсуждали, что сделали, что осталось</p>
            </button>
            <button
              onClick={() => setSection("plans")}
              className="rounded-xl border border-white/[0.08] bg-card p-6 text-left hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Icon name="ListTodo" size={20} className="text-amber-400" />
                </div>
                <span className="text-lg font-semibold">Планы</span>
              </div>
              <p className="text-sm text-muted-foreground">Что ещё хочется сделать — список задач на будущее</p>
            </button>
          </div>
        )}

        {section === "plans" && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
            {renderMarkdown(TAB_PLANS)}
          </div>
        )}

        {section === "1c" && (
          <>
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {tabs1c.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? "bg-primary/20 text-primary font-medium"
                      : "text-muted-foreground hover:bg-white/[0.06]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
              {activeTab === "creation" && renderMarkdown(TAB_CREATION)}
              {activeTab === "code" && (
                <div>
                  <DebugBadge id="Instructions:copyCodeBtn">
                    <Button onClick={handleCopyCode} className="mb-4 rounded-xl gap-2">
                      <Icon name="Copy" size={16} />
                      Скопировать код
                    </Button>
                  </DebugBadge>
                  <pre className="bg-black/30 rounded-xl p-4 overflow-x-auto text-xs font-mono text-green-300 whitespace-pre max-h-[70vh] overflow-y-auto">
                    <code>{MODULE_CODE}</code>
                  </pre>
                </div>
              )}
              {activeTab === "usage" && renderMarkdown(TAB_USAGE)}
            </div>
          </>
        )}

        {section === "hosting" && (
          <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
            {renderMarkdown(TAB_HOSTING)}
          </div>
        )}

        {section === "journal" && (
          <>
            {JOURNAL_TABS.length === 0 ? (
              <div className="rounded-xl border border-white/[0.08] bg-card p-6 text-sm text-muted-foreground">
                Пока пусто. Журнал заполняется по ходу работы над блоками сайта.
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4 overflow-x-auto">
                  {JOURNAL_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setJournalTab(tab.key)}
                      className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                        journalTab === tab.key
                          ? "bg-emerald-500/20 text-emerald-300 font-medium"
                          : "text-muted-foreground hover:bg-white/[0.06]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
                  {renderMarkdown(
                    JOURNAL_TABS.find((t) => t.key === journalTab)?.content || "",
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Instructions;