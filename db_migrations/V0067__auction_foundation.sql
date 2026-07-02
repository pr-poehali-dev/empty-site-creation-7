-- Аукцион для Telegram-канала: фундамент данных (Этап 1)

-- Аукционная роль сотрудника (Вариант А: отдельный признак)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS auction_role VARCHAR(16) NOT NULL DEFAULT 'none';

-- Лоты аукциона
CREATE TABLE IF NOT EXISTS auction_lots (
  id SERIAL PRIMARY KEY,
  created_by INTEGER NOT NULL REFERENCES employees(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  photo_url TEXT,
  desired_price NUMERIC(12,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  quantity_left INTEGER NOT NULL DEFAULT 1,
  ends_at TIMESTAMP NOT NULL,
  payment_deadline_minutes INTEGER NOT NULL DEFAULT 60,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  channel_message_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_lots_status ON auction_lots(status);
CREATE INDEX IF NOT EXISTS idx_auction_lots_ends_at ON auction_lots(ends_at);

-- Ставки покупателей
CREATE TABLE IF NOT EXISTS auction_bids (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES auction_lots(id),
  telegram_id BIGINT NOT NULL,
  username VARCHAR(255),
  display_name VARCHAR(255),
  price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (lot_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_bids_lot ON auction_bids(lot_id);

-- Очередь выкупа / победители
CREATE TABLE IF NOT EXISTS auction_winners (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES auction_lots(id),
  telegram_id BIGINT NOT NULL,
  username VARCHAR(255),
  display_name VARCHAR(255),
  price NUMERIC(12,2) NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  win_type VARCHAR(16) NOT NULL DEFAULT 'auction',
  status VARCHAR(24) NOT NULL DEFAULT 'awaiting_payment',
  pay_deadline TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_winners_lot ON auction_winners(lot_id);
CREATE INDEX IF NOT EXISTS idx_auction_winners_status ON auction_winners(status);

-- Платежи (каркас, заполним на этапе оплаты)
CREATE TABLE IF NOT EXISTS auction_payments (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES auction_lots(id),
  winner_id INTEGER REFERENCES auction_winners(id),
  telegram_id BIGINT,
  amount NUMERIC(12,2),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  provider VARCHAR(32),
  provider_payment_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auction_payments_lot ON auction_payments(lot_id);
