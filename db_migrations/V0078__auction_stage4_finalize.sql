-- Этап 4: подведение итогов аукциона
-- Флаг: сотрудник уже предупреждён о лоте, где ставок меньше товара
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS low_bids_warned BOOLEAN NOT NULL DEFAULT false;

-- Момент фактического завершения (для истории/сортировки завершённых)
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;

-- Защита от дублей победителей при повторных прогонах крона
CREATE UNIQUE INDEX IF NOT EXISTS auction_winners_lot_tg_uniq
  ON auction_winners (lot_id, telegram_id);

-- Быстрый поиск лотов для подведения итогов
CREATE INDEX IF NOT EXISTS auction_lots_status_ends_idx
  ON auction_lots (status, ends_at);

-- Быстрый поиск победителей по лоту и статусу
CREATE INDEX IF NOT EXISTS auction_winners_lot_status_idx
  ON auction_winners (lot_id, status);