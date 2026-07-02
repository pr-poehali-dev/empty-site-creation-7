-- Каналы для публикации лотов + привязка лота к каналу

CREATE TABLE IF NOT EXISTS auction_channels (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL UNIQUE,
  title VARCHAR(255),
  username VARCHAR(255),
  can_post BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_channels_active ON auction_channels(is_active, can_post);

ALTER TABLE auction_lots
  ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES auction_channels(id);
