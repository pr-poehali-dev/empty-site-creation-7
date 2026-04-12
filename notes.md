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