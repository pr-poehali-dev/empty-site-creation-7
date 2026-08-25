ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_base_changed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS price_retail_changed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS price_wholesale_changed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS price_purchase_changed_at TIMESTAMP;

ALTER TABLE wholesale_order_items
  ADD COLUMN IF NOT EXISTS price_source VARCHAR(8),
  ADD COLUMN IF NOT EXISTS price_base_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS price_set_at TIMESTAMP;