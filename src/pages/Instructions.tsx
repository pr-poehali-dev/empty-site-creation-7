import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import MODULE_FORM_BSL from "@/data/module-form-bsl";

const README_CONTENT = `# Обработка обмена с сайтом для 1С:УНФ

## Создание обработки в конфигураторе

### 1. Создать внешнюю обработку
Файл → Новый → Внешняя обработка → Имя: \`ОбменССайтом\`

### 2. Реквизиты обработки
- \`АдресСервера\` (Строка, 500) — URL API
- \`КлючAPI\` (Строка, 100) — ключ авторизации

### 3. Табличные части

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

### 4. Создание формы обработки (пошагово)

#### 4.1. Создание формы
1. В дереве обработки (левая панель конфигуратора) раскрыть обработку \`ОбменССайтом\`
2. Правой кнопкой по **Формы** → **Добавить**
3. В открывшемся конструкторе выбрать тип: **Форма обработки**
4. Нажать **Готово**
5. Откроется редактор формы. Вверху слева — дерево **элементов формы**, справа — **реквизиты**, внизу — вкладки **Модуль** / **Команды**

#### 4.2. Создание вкладок (страниц)
1. В дереве элементов (левая верхняя панель) выделить корень **Форма**
2. Нажать кнопку **Добавить** (зелёный плюс на панели над деревом)
3. Тип: **Группа — Страницы**. Имя: \`Страницы\`. Нажать **ОК**
4. Теперь выделить созданную группу \`Страницы\` и нажать **Добавить**
5. Тип: **Группа — Страница**. Имя: \`СтраницаСопоставление\`, Заголовок: \`Сопоставление\`. **ОК**
6. Снова выделить \`Страницы\` → **Добавить** → **Группа — Страница**. Имя: \`СтраницаВыгрузка\`, Заголовок: \`Выгрузка\`. **ОК**
7. Снова выделить \`Страницы\` → **Добавить** → **Группа — Страница**. Имя: \`СтраницаЗагрузка\`, Заголовок: \`Загрузка\`. **ОК**

Результат: в форме появятся три вкладки. Все дальнейшие элементы размещаются **внутри нужной страницы** — для этого выделяйте страницу перед добавлением.

#### 4.3. Вкладка "Сопоставление" — элементы

**Поля ввода (подключение):**
1. Выделить \`СтраницаСопоставление\` → **Добавить** → Тип: **Поле ввода**
2. В свойствах: ПутьКДанным = \`Объект.АдресСервера\`. **ОК**
3. Повторить: **Добавить** → **Поле ввода** → ПутьКДанным = \`Объект.КлючAPI\`

**Кнопка "Загрузить структуру сайта":**
1. Перейти внизу на вкладку **Команды** → **Команды формы**
2. Нажать **Добавить**. Имя: \`ЗагрузитьСтруктуруСайта\`, Заголовок: \`Загрузить структуру сайта\`
3. В свойствах команды, поле **Действие** → нажать лупу → выбрать **Создать на клиенте** → **ОК**
4. Вернуться в дерево элементов. Выделить \`СтраницаСопоставление\` → **Добавить** → Тип: **Кнопка**
5. ИмяКоманды: выбрать \`ЗагрузитьСтруктуруСайта\`. **ОК**

**Таблица СопоставлениеПолей:**
1. Выделить \`СтраницаСопоставление\` → **Добавить** → Тип: **Таблица**
2. ПутьКДанным: \`Объект.СопоставлениеПолей\`. **ОК**
3. Система предложит добавить колонки — отметить: ПолеСайта, ОписаниеПоля, Обязательное, РеквизитНоменклатуры → **ОК**

**Таблица СопоставлениеЦен:**
1. Выделить \`СтраницаСопоставление\` → **Добавить** → **Таблица**
2. ПутьКДанным: \`Объект.СопоставлениеЦен\`. **ОК**
3. Колонки: ВидЦеныСайта, ОписаниеЦены, ТипЦен1С → **ОК**

#### 4.4. Вкладка "Выгрузка" — элементы

Создать команды (вкладка **Команды** → **Добавить**) и кнопки аналогично п. 4.3:

| Команда | Заголовок кнопки |
|---|---|
| \`ЗаполнитьСписокТоваров\` | Заполнить список |
| \`ВыгрузитьНаСайт\` | Выгрузить на сайт |
| \`СвязатьССайтом\` | Связать с сайтом |

Таблица:
1. Выделить \`СтраницаВыгрузка\` → **Добавить** → **Таблица** → ПутьКДанным: \`Объект.ТоварыДляВыгрузки\`
2. Колонки: Номенклатура, ИдСайта, Выгружать

Порядок элементов сверху вниз: кнопка "Заполнить список" → таблица → кнопки "Выгрузить" и "Связать"

#### 4.5. Вкладка "Загрузка" — элементы

Создать команды и кнопки:

| Команда | Заголовок кнопки |
|---|---|
| \`ЗагрузитьССайта\` | Загрузить с сайта |
| \`СоздатьНоменклатуру\` | Создать номенклатуру |
| \`УстановитьЦены\` | Установить цены |

Таблицы:
1. \`СтраницаЗагрузка\` → **Добавить** → **Таблица** → \`Объект.ТоварыССайта\` → все колонки
2. \`СтраницаЗагрузка\` → **Добавить** → **Таблица** → \`Объект.ШаблонРеквизитов\` → колонки: Представление, ТипРеквизита, ЗначениеПоУмолчанию

Порядок: кнопка "Загрузить с сайта" → таблица товаров → таблица шаблона → кнопки "Создать номенклатуру" и "Установить цены"

#### 4.6. Поле Лог (общее, под вкладками)

1. Перейти на вкладку **Реквизиты** (правая верхняя панель редактора формы)
2. Нажать **Добавить**. Имя: \`Лог\`, Тип: \`Строка\` (неограниченная длина)
3. Вернуться в дерево элементов. Выделить корень **Форма** (не страницу!)
4. **Добавить** → Тип: **Поле ввода** → ПутьКДанным: \`Лог\`
5. В свойствах элемента установить: **ТолькоПросмотр** = Истина, **МногострочныйРежим** = Истина, **Высота** = 5
6. Если элемент попал внутрь страницы — перетащить мышью ниже группы \`Страницы\`, чтобы лог был виден на всех вкладках

### 6. Модуль формы
Скопировать код из файла \`МодульФормы.bsl\` → Модуль формы обработки

---

## Сценарий первого обмена

### Подготовка
1. Сохранить обработку: Файл → Сохранить как → \`ОбменССайтом.epf\`
2. Открыть в 1С:УНФ: Файл → Открыть → выбрать \`ОбменССайтом.epf\`
3. Заполнить поле \`Адрес сервера\` — URL вашего API (из раздела "Обмен с 1С" на сайте)
4. Заполнить поле \`Ключ API\` — ключ авторизации (из того же раздела)

### Шаг 1. Загрузка структуры сайта
1. Перейти на вкладку **Сопоставление**
2. Нажать кнопку **Загрузить структуру сайта**
3. В таблице \`СопоставлениеПолей\` появятся поля товаров сайта (название, артикул, бренд и т.д.)
4. В таблице \`СопоставлениеЦен\` появятся виды цен сайта
5. Проверить лог внизу — должно быть сообщение об успешной загрузке

### Шаг 2. Сопоставление полей
1. В таблице \`СопоставлениеПолей\` для каждой строки выбрать соответствующий реквизит номенклатуры 1С
2. Обязательные поля (колонка "Обязательное" = Да) должны быть заполнены
3. В таблице \`СопоставлениеЦен\` для каждого вида цены сайта выбрать тип цен из справочника 1С

### Шаг 3. Выгрузка товаров на сайт
1. Перейти на вкладку **Выгрузка**
2. Нажать **Заполнить список** — таблица заполнится номенклатурой из 1С
3. Отметить галочкой \`Выгружать\` те товары, которые нужно отправить на сайт
4. Нажать **Выгрузить на сайт**
5. После успешной выгрузки в колонке \`ИдСайта\` появятся идентификаторы товаров на сайте
6. Нажать **Связать с сайтом** — это сохранит связку между товарами 1С и сайта для будущих обменов

### Шаг 4. Загрузка товаров с сайта (при необходимости)
1. Перейти на вкладку **Загрузка**
2. Нажать **Загрузить с сайта** — таблица заполнится товарами, которые есть на сайте
3. Отметить галочкой \`Загружать\` нужные товары
4. При необходимости настроить \`ШаблонРеквизитов\` — значения по умолчанию для создаваемой номенклатуры
5. Нажать **Создать номенклатуру** — в 1С создадутся новые элементы справочника Номенклатура
6. Нажать **Установить цены** — цены из сайта запишутся в регистр цен 1С

### Типичные ошибки
- **"Ошибка авторизации"** — проверьте правильность ключа API
- **"Не удалось подключиться"** — проверьте адрес сервера, должен начинаться с https://
- **"Обязательное поле не сопоставлено"** — вернитесь на вкладку Сопоставление и заполните все обязательные поля
- **Пустая таблица после "Заполнить список"** — убедитесь, что в справочнике Номенклатура есть элементы`;

const downloadFile = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

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

const Instructions = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");

  if (user.role !== "owner") {
    navigate("/admin");
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-white/[0.06]"
              onClick={() => navigate("/admin/dashboard")}
            >
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg sm:text-xl font-semibold">Инструкции от Юры</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-white/[0.08] gap-2"
              onClick={() => downloadFile(MODULE_FORM_BSL, "МодульФормы.bsl", "text/plain;charset=utf-8")}
            >
              <Icon name="FileCode" size={16} />
              <span className="hidden sm:inline">Скачать .bsl</span>
              <span className="sm:hidden">.bsl</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-white/[0.08] gap-2"
              onClick={() => downloadFile(README_CONTENT, "README.md", "text/markdown;charset=utf-8")}
            >
              <Icon name="Download" size={16} />
              <span className="hidden sm:inline">Скачать README</span>
              <span className="sm:hidden">README</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
          {renderMarkdown(README_CONTENT)}
        </div>
      </main>
    </div>
  );
};

export default Instructions;