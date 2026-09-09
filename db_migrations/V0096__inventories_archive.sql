-- Архив инвентаризаций: удаление для управленцев и оптовиков — это уход в архив.
-- Видит архив только владелец, он же стирает окончательно.
ALTER TABLE inventories ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE inventories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE inventories ADD COLUMN IF NOT EXISTS archived_by VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_inventories_archived ON inventories(is_archived);