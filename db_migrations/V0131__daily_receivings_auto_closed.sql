ALTER TABLE daily_receivings
  ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN daily_receivings.auto_closed IS
  'Приёмку закрыл не мастер, а система — сутки кончились, а кнопку не нажали';

CREATE INDEX IF NOT EXISTS idx_daily_receivings_open_date
  ON daily_receivings (manager_id, work_date) WHERE closed = false;