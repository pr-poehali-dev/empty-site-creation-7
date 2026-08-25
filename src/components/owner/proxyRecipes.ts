export interface Step {
  title: string;
  text: string;
}

export interface Recipe {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  price: {
    cost: string;
    card: string;
    limit: string;
    enough: string;
    catch?: string;
  };
  fileName: string;
  code: (key: string) => string;
  steps: Step[];
  urlHint: string;
}

const CORE = `const TELEGRAM = "https://api.telegram.org";

function forbidden() {
  return new Response("Forbidden", { status: 403 });
}

async function relay(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.headers.get("x-proxy-key") !== PROXY_KEY) {
    return forbidden();
  }
  const url = new URL(request.url);
  const upstream = await fetch(TELEGRAM + url.pathname + url.search, {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    body: request.method === "GET" ? undefined : await request.text(),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}`;

const head = (place: string, key: string) =>
  `// Посредник для Telegram — ${place}.
// Ключ уже подставлен, менять ничего не нужно.
// Скопируйте этот код целиком.

const PROXY_KEY = "${key}";`;

export const RECIPES: Recipe[] = [
  {
    id: "cloudflare",
    name: "Cloudflare Workers",
    icon: "Cloud",
    tagline: "Бесплатно навсегда, карта не нужна",
    price: {
      cost: "Бесплатно, без ограничения по времени",
      card: "Не спрашивают",
      limit: "100 000 обращений в сутки",
      enough:
        "Это очень много. Даже при тысяче сообщений в день вы займёте пару процентов лимита.",
    },
    fileName: "worker.js",
    code: (key) => `${head("Cloudflare Workers", key)}

${CORE}

export default {
  fetch: relay,
};`,
    steps: [
      {
        title: "Регистрация",
        text: "Откройте dash.cloudflare.com/sign-up. Введите почту и пароль, подтвердите письмо из ящика. Карту не спросят.",
      },
      {
        title: "Не пользуйтесь Playground",
        text: "Важно. Адрес workers.new и кнопка «Playground» ведут в песочницу для опытов. Она публикует свой демо-пример, а не ваш код, и адрес получается нерабочим. Всё делайте только через личный кабинет, как описано ниже.",
      },
      {
        title: "Открыть список воркеров",
        text: "Зайдите на dash.cloudflare.com. В левом меню выберите «Compute (Workers)» → «Workers & Pages». Нажмите синюю кнопку «Create» (или «Create application») справа сверху.",
      },
      {
        title: "Выбрать «Start with Hello World!»",
        text: "Появится экран «Ship something new» с плитками. Нужна «Start with Hello World!» — нажмите её, затем «Get started». Плитки Connect GitHub, Select a template и Upload your static files не подходят.",
      },
      {
        title: "Имя и создание",
        text: "Впишите имя латиницей, например tg-relay — оно станет частью адреса. Нажмите «Deploy» (иногда кнопка называется «Create»). Подождите несколько секунд, пока воркер создастся.",
      },
      {
        title: "Вставить код",
        text: "Откроется страница воркера. Нажмите «Edit code» (или вкладка «Code» → кнопка «Edit»). В редакторе будет демо-пример — щёлкните по тексту, нажмите Ctrl+A, затем Delete, чтобы не осталось ни строчки. Скопируйте код ниже кнопкой «Скопировать» и вставьте (Ctrl+V).",
      },
      {
        title: "Опубликовать",
        text: "Нажмите «Deploy» в правом верхнем углу редактора и подтвердите. Если кнопка серая — обновите страницу по F5 и повторите.",
      },
      {
        title: "Проверить, что код встал",
        text: "Откройте адрес воркера в новой вкладке браузера. Правильный ответ — короткая надпись Forbidden на пустой странице. Если вместо неё показалась страница Cloudflare с редактором кода или надпись про Playground — значит опубликовался демо-пример. Вернитесь к шагу «Вставить код» и повторите через «Edit code».",
      },
      {
        title: "Забрать адрес",
        text: "Адрес вида tg-relay.ваше-имя.workers.dev показан вверху страницы воркера, рядом с именем. Скопируйте его целиком, вместе с https://",
      },
    ],
    urlHint: "https://tg-relay.ваше-имя.workers.dev",
  },
  {
    id: "deno",
    name: "Deno Deploy",
    icon: "Zap",
    tagline: "Самая простая регистрация",
    price: {
      cost: "Бесплатно",
      card: "Не спрашивают",
      limit: "1 000 000 обращений в месяц",
      enough:
        "С запасом на любые задачи. Лимит месячный, а не суточный — всплески переносит спокойно.",
      catch:
        "Вход только через аккаунт GitHub. Если его нет — придётся завести, это ещё пара минут.",
    },
    fileName: "main.ts",
    code: (key) => `${head("Deno Deploy", key)}

${CORE}

Deno.serve(relay);`,
    steps: [
      {
        title: "Регистрация",
        text: "Откройте dash.deno.com. Нажмите вход через GitHub — если аккаунта нет, создайте его там же. Карту не спросят.",
      },
      {
        title: "Новый проект",
        text: "Нажмите «New Playground» — это самый быстрый путь, без подключения репозиториев.",
      },
      {
        title: "Вставить код",
        text: "Откроется редактор с примером. Выделите всё (Ctrl+A), удалите, вставьте код ниже (Ctrl+V).",
      },
      {
        title: "Опубликовать",
        text: "Нажмите «Save & Deploy» справа сверху. Публикация занимает несколько секунд.",
      },
      {
        title: "Забрать адрес",
        text: "Адрес показан над редактором, вида имя-проекта.deno.dev — скопируйте его.",
      },
    ],
    urlHint: "https://имя-проекта.deno.dev",
  },
  {
    id: "netlify",
    name: "Netlify",
    icon: "Globe",
    tagline: "Хороший запасной вариант",
    price: {
      cost: "Бесплатно",
      card: "Не спрашивают",
      limit: "125 000 вызовов в месяц",
      enough:
        "Хватит для обычной нагрузки, но лимит скромнее прочих. Как запасной путь — вполне.",
      catch:
        "Настройка чуть длиннее: нужно создать папку с файлом, а не просто вставить код в окно.",
    },
    fileName: "netlify/functions/relay.js",
    code: (key) => `${head("Netlify Functions", key)}

${CORE}

export default relay;

export const config = {
  path: "/*",
};`,
    steps: [
      {
        title: "Оценка",
        text: "Этот путь требует загрузки папки с файлом. Если хочется быстрее — выберите Cloudflare или Deno.",
      },
      {
        title: "Регистрация",
        text: "Откройте app.netlify.com/signup. Почта и пароль либо вход через GitHub. Карту не спросят.",
      },
      {
        title: "Подготовить папку",
        text: "На компьютере создайте папку tg-relay. Внутри неё — папку netlify, внутри неё — папку functions. В последней создайте файл relay.js и вставьте в него код ниже.",
      },
      {
        title: "Загрузить",
        text: "В Netlify откройте «Sites» и перетащите папку tg-relay в область с надписью про drag and drop. Загрузка займёт несколько секунд.",
      },
      {
        title: "Забрать адрес",
        text: "Netlify покажет адрес вида случайное-имя.netlify.app. Скопируйте его — имя можно поменять в настройках сайта.",
      },
    ],
    urlHint: "https://имя-сайта.netlify.app",
  },
  {
    id: "vercel",
    name: "Vercel",
    icon: "Triangle",
    tagline: "Если аккаунт уже есть",
    price: {
      cost: "Бесплатно",
      card: "Не спрашивают",
      limit: "100 ГБ трафика в месяц",
      enough: "Трафика хватит с избытком — сообщения весят считаные байты.",
      catch:
        "Бесплатный тариф разрешён только для некоммерческих проектов. Если посредник обслуживает рабочий магазин, формально это нарушение правил Vercel — берите Cloudflare.",
    },
    fileName: "api/relay.js",
    code: (key) => `${head("Vercel", key)}

${CORE}

export default relay;

export const config = {
  runtime: "edge",
};`,
    steps: [
      {
        title: "Оценка",
        text: "Обратите внимание на ограничение выше: для рабочего магазина Vercel формально не подходит. Для личных задач — нормально.",
      },
      {
        title: "Регистрация",
        text: "Откройте vercel.com/signup. Вход через GitHub или почту. Карту не спросят.",
      },
      {
        title: "Подготовить папку",
        text: "На компьютере создайте папку tg-relay, внутри — папку api, а в ней файл relay.js с кодом ниже.",
      },
      {
        title: "Загрузить",
        text: "Установите Vercel CLI командой npm i -g vercel, затем в папке tg-relay выполните vercel. Либо загрузите папку через веб-интерфейс, создав новый проект.",
      },
      {
        title: "Забрать адрес",
        text: "Vercel покажет адрес вида tg-relay.vercel.app — скопируйте его.",
      },
    ],
    urlHint: "https://tg-relay.vercel.app",
  },
];