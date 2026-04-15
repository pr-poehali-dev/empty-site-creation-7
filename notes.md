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