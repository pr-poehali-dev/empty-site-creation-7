ALTER TABLE daily_receivings ADD COLUMN IF NOT EXISTS opened_local timestamp NULL;
ALTER TABLE daily_receivings ADD COLUMN IF NOT EXISTS closed_local timestamp NULL;