ALTER TABLE products ADD COLUMN IF NOT EXISTS price_base_parsed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE price_set_items ADD COLUMN IF NOT EXISTS new_base NUMERIC(14,2);
ALTER TABLE price_set_items ADD COLUMN IF NOT EXISTS new_base_source VARCHAR(20);
CREATE TABLE IF NOT EXISTS price_base_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    old_price NUMERIC(14,2),
    new_price NUMERIC(14,2),
    source VARCHAR(30) NOT NULL,
    rate_by_per_100_rub NUMERIC(12,4),
    price_set_id INTEGER,
    draft_id INTEGER,
    user_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_base_history_product ON price_base_history (product_id, created_at DESC);