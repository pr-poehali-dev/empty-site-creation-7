-- Мультиканальная публикация: один лот -> несколько каналов, у каждого свой пост

CREATE TABLE IF NOT EXISTS auction_lot_channels (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES auction_lots(id),
  channel_id INTEGER NOT NULL REFERENCES auction_channels(id),
  message_id BIGINT,
  status VARCHAR(16) NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (lot_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_lot_channels_lot ON auction_lot_channels(lot_id);
CREATE INDEX IF NOT EXISTS idx_auction_lot_channels_channel ON auction_lot_channels(channel_id);
