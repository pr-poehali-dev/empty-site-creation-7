CREATE TABLE IF NOT EXISTS auction_channels (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL UNIQUE,
    title VARCHAR(255),
    username VARCHAR(255),
    added_by INTEGER NOT NULL REFERENCES managers(id),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auction_lot_posts (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER NOT NULL REFERENCES auction_lots(id),
    channel_id INTEGER NOT NULL REFERENCES auction_channels(id),
    message_id BIGINT,
    status VARCHAR(32) NOT NULL DEFAULT 'published',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (lot_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_lot_posts_lot ON auction_lot_posts(lot_id);