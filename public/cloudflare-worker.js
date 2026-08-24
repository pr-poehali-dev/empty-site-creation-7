// Посредник для Telegram. Вставьте этот код в Cloudflare Worker.
// Замените ЗАМЕНИТЕ_НА_СВОЙ_КЛЮЧ на значение секрета TG_PROXY_KEY из проекта.

const PROXY_KEY = "ЗАМЕНИТЕ_НА_СВОЙ_КЛЮЧ";

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("X-Proxy-Key") !== PROXY_KEY) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    const target = "https://api.telegram.org" + url.pathname + url.search;

    const upstream = await fetch(target, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: request.method === "GET" ? undefined : await request.text(),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  },
};
