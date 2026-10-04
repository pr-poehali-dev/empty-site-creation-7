CREATE TABLE IF NOT EXISTS invoice_price_log (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price_field VARCHAR(32) NOT NULL,
  old_price NUMERIC(14,2),
  new_price NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reverted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invoice_price_log_draft ON invoice_price_log(draft_id);
ALTER TABLE invoice_suppliers ADD COLUMN IF NOT EXISTS price_field VARCHAR(32) NOT NULL DEFAULT 'price_purchase';
ALTER TABLE invoice_suppliers ADD COLUMN IF NOT EXISTS price_mode VARCHAR(16) NOT NULL DEFAULT 'ready';