# Заметки по проекту

## Структура цен в БД (products)

Виды цен хранятся **прямо в таблице products** как отдельные колонки (НЕ отдельная таблица):

| Поле БД          | Тип           | Назначение       |
|-------------------|---------------|------------------|
| price_base        | numeric(12,2) | Базовая цена     |
| price_retail      | numeric(12,2) | Розничная цена   |
| price_wholesale   | numeric(12,2) | Оптовая цена     |
| price_purchase    | numeric(12,2) | Закупочная цена  |

Все 4 цены — nullable.

## Ключевые поля products для обмена с 1С

- `name` (varchar 300) — наименование
- `article` (varchar 100) — артикул
- `brand` (varchar 150) — бренд
- `supplier_code` (varchar 100) — код поставщика
- `category_id` → ссылка на categories (иерархическая, parent_id)
- `is_archived` — мягкое удаление

## Штрихкоды

Отдельная таблица `product_barcodes`:
- `product_id` → products(id)
- `barcode` (varchar 100)
- У одного товара может быть несколько штрихкодов

## Категории

Таблица `categories` — иерархическая (parent_id → self).
277 записей. Поля: name, sort_order, keywords (массив).

## external_id (V0027)

Поле `external_id` (varchar 50, nullable, unique) добавлено в `products` и `categories` — для связки с UUID из 1С.

## Оптимизация каталога для массовой загрузки (100 000+ товаров)

### Бесконечный скролл
- **Файл:** `src/pages/Catalog.tsx`
- `fetchItems` принимает `pageNum` и `append` — при append добавляет товары к существующим (по 50 шт)
- `IntersectionObserver` на sentinel div внизу списка
- При смене категории/поиска/мутациях — сброс `page=1`, `items=[]`, `hasMore=true`

### Lazy loading картинок
- **Файл:** `src/pages/Catalog.tsx`
- Все `<img>` имеют `loading="lazy"`

### Индексы БД
- **Миграция:** `V0041__add_search_indexes_products.sql`
- Индексы на `lower(name)`, `lower(brand)`, `lower(supplier_code)`, `lower(product_group)`, `external_id`
- pg_trgm недоступен — используются btree по lower()

### Thumbnail (превью 200×200 WebP)

**Таблица:** миграция `V0042` — колонка `thumbnail_url` в `product_images`

**Генерация при загрузке через каталог:**
- `backend/catalog-products/index.py` → `upload_image()` возвращает `(cdn_url, thumb_url)`
- Pillow: `img.thumbnail((200, 200))`, WebP quality=75
- S3 путь: `catalog/thumb/{uid}.webp`
- Используется в POST и PUT товара

**Генерация при загрузке из 1С:**
- `backend/1c-exchange/index.py` → `upload_image_with_thumb()`
- `s3_client` инициализируется лениво
- Формат images в JSON: массив строк base64 или объектов `{"data": "base64", "content_type": "image/jpeg"}`
- Зависимости: `boto3`, `Pillow` в requirements.txt

**Отображение на фронте:**
- `src/pages/Catalog.tsx` — в списке: `thumbnail_url || url` (fallback на оригинал)
- Интерфейс `ProductImage` расширен полем `thumbnail_url?: string`
- GET бэкенда включает `thumbnail_url` в ответ

## План для истории заявок

### 1. БД — новая таблица `order_history`
Миграция V0045:
```sql
CREATE TABLE order_history (
    id BIGSERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,
    user_id INTEGER,
    user_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_order_history_order ON order_history(order_id, created_at DESC);
```
JSONB → автосжатие (TOAST).

### 2. Бэкенд — запись событий
**2.1. Хелпер `log_history()`** в каждой функции, меняющей заявку (`wholesale-orders`, `order-payments`, при необходимости `temp-products`):
```python
def log_history(cur, order_id, user_id, user_name, action, details=None):
    cur.execute(
        "INSERT INTO order_history (order_id, user_id, user_name, action, details) VALUES (%s,%s,%s,%s,%s)",
        (order_id, user_id, user_name, action, json.dumps(details) if details else None)
    )
```

**2.2. Точки записи** (в той же транзакции, что и изменение):
- POST /wholesale-orders → `create`
- PUT позиции: `item_add`, `item_remove`, `item_qty` (before/after), `item_price` (before/after)
- смена статуса → `status` (from/to)
- платежи → `payment` (сумма, тип)
- комментарий → `comment`
- шапка (покупатель, дата и т.п.) → `header_edit`

**2.3. Батчинг массовых операций** — одно событие `bulk_add` с массивом в details, а не по событию на товар.

**2.4. Не писать пустые правки** (было = стало).

### 3. Производительность
- Только INSERT в текущую транзакцию (без доп. HTTP).
- Один индекс (order_id + created_at).
- При создании заявки с N позициями = 2 INSERT (create + bulk_add), независимо от N.
- Без триггеров в БД — всё явно в коде.
- Оверхед ~5–10 мс даже на 500 позициях.

### 4. Новая функция `order-history` (чтение)
`/backend/order-history/index.py`:
- GET `?order_id=X` → массив событий (owner only, иначе 403).
- Пагинация `?page=1&per_page=100`.
- `user_name` хранится снапшотом, джойн не нужен.
- tests.json с 401/403/200.

### 5. Фронтенд
**5.1. Кнопка «История»** в шапке заявки справа от названия (только если `user.role === 'owner'`). Ведёт на `/wholesale-orders/:id/history`.

**5.2. Страница `OrderHistoryPage.tsx`**:
- Роут `/wholesale-orders/:id/history` в `App.tsx`.
- Guard: не owner → редирект на заявку.
- Шапка: «История заявки №X», кнопка «Назад».
- Таблица/лента: Время | Пользователь | Действие | Детали.
- Словарь action → человекочитаемая строка.
- Бесконечная подгрузка или «Показать ещё».

**5.3. URL** из `func2url.json` после `sync_backend`.

### 6. Порядок работ
1. Миграция V0045 (таблица + индекс).
2. Хелпер `log_history` + интеграция в `wholesale-orders`.
3. Интеграция в `order-payments`.
4. Функция `order-history` (GET) + тесты + sync_backend.
5. Страница `OrderHistoryPage.tsx` + роут + словарь.
6. Кнопка «История» в шапке (owner only).
7. Проверка: создание заявки на ~50 позициях не тормозит.

### 7. На будущее
- Архивация истории старше 2 лет.
- Фильтр по типу события/пользователю.
- Экспорт в PDF/Excel.

### Открытые вопросы
- Нужна ли история для комментариев и смены статусов (есть ли сейчас в проекте)?
- «Шапка заявки» — кнопку ставить на страницу просмотра, редактирования или обе?

## Обмен с 1С онлайн режим

### Концепция
Онлайн-слой поверх существующего `1c-exchange` (пакетный). 1С УНФ опубликована по HTTPS — наш бэкенд ходит напрямую синхронно по запросу пользователя.

### Архитектура
- Новая Cloud Function `1c-online` (Python, `requests` + Basic Auth).
- Секреты: URL 1С, логин, пароль технической учётки.
- Фронт → наш бэк → HTTPS в 1С → ответ обратно.

### Что можно делать онлайн
| Операция | Метод 1С |
|---|---|
| Загрузить фото к номенклатуре | POST в Catalog_Номенклатура + присоединённый файл |
| Обновить реквизиты товара (артикул, бренд) | PATCH по GUID |
| Установить цены | POST документа «УстановкаЦенНоменклатуры» |
| Создать счёт покупателю | POST Document_СчетНаОплатуПокупателю |
| Создать реализацию | POST Document_РасходнаяНакладная |
| Получить остатки/цены real-time | GET регистров |

### Варианты интеграции
- **A. Стандартный OData** — включается в 1С галкой. Минус: знание метаданных УНФ, проведение документов — отдельные вызовы.
- **B. Свой HTTP-сервис в 1С** — программист 1С пишет обработки под наши эндпоинты. Плюс: удобно, быстро. Минус: разработка на стороне 1С.
- **C. Гибрид** — OData для чтения/простых правок, HTTP-сервис для документов с проведением. **Рекомендуется.**

### Что понадобится от пользователя
1. Адрес публикации 1С (https://...), логин/пароль техучётки.
2. Подтверждение включённого OData или готовность подключить программиста 1С для варианта B.
3. Список операций в приоритете (фото / цены / документы).

### Подводные камни
- Онлайн медленнее пакетного: каждая операция = HTTP-запрос к 1С (200–1500 мс). Массовые изменения — оставлять в пакетном режиме.
- 1С упадёт → кнопка вернёт ошибку. Нужна очередь повторов — таблица `pending_1c_operations`.
- Документы в 1С требуют сопоставления сущностей (контрагент, договор, склад, организация) с данными сайта.

### Первый шаг (для проверки связки)
Загрузка фото товара в 1С из карточки на сайте — самая простая операция, покажет работоспособность всей цепочки.