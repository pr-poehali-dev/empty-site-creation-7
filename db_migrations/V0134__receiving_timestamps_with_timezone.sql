-- Метки времени отдавались браузеру без пометки часового пояса.
-- Браузер считал их местным временем, хотя это Гринвич — экран врал на 3 часа.
-- Переводим в тип с поясом: содержимое то же, но теперь телефон сам
-- переведёт в своё местное время, где бы ни находился сотрудник.
-- work_date не трогаем: это рабочая дата, а не момент времени.

ALTER TABLE receiving_moves
  ALTER COLUMN moved_at TYPE timestamptz USING moved_at AT TIME ZONE 'UTC';

ALTER TABLE receiving_items
  ALTER COLUMN checked_at TYPE timestamptz USING checked_at AT TIME ZONE 'UTC';

ALTER TABLE receiving_items
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

ALTER TABLE daily_receivings
  ALTER COLUMN opened_at TYPE timestamptz USING opened_at AT TIME ZONE 'UTC';

ALTER TABLE daily_receivings
  ALTER COLUMN closed_at TYPE timestamptz USING closed_at AT TIME ZONE 'UTC';