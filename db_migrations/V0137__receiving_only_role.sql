ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
UPDATE roles SET name = 'Приёмка', description = 'Только приёмка: одна кнопка, дальше по правам приёмки' WHERE id = 6 AND name = 'Мастер';
UPDATE roles SET is_hidden = true WHERE id = 7 AND name = 'Протирка';