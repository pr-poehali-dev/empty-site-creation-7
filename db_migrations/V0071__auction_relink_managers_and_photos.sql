-- Этап 2, Шаг 1: достройка фундамента аукциона
-- 1) Перепривязка автора лота с мёртвой таблицы employees на реальную managers
-- 2) Хранение до 5 фото у лота (массив ссылок), сохраняем старое photo_url для совместимости

-- Снимаем старую внешнюю связь на employees (лотов нет, безопасно)
ALTER TABLE auction_lots
  DROP CONSTRAINT IF EXISTS auction_lots_created_by_fkey;

-- Привязываем автора лота к managers
ALTER TABLE auction_lots
  ADD CONSTRAINT auction_lots_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES managers(id);

-- До 5 фото: массив ссылок (первое фото — обложка)
ALTER TABLE auction_lots
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';
