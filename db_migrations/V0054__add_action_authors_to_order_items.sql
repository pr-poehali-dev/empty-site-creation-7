ALTER TABLE wholesale_order_items
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(8),
  ADD COLUMN IF NOT EXISTS qty_changed_by VARCHAR(8),
  ADD COLUMN IF NOT EXISTS price_changed_by VARCHAR(8),
  ADD COLUMN IF NOT EXISTS restored_by VARCHAR(8);

UPDATE wholesale_order_items
SET created_by = COALESCE(created_by, '4'),
    qty_changed_by = COALESCE(qty_changed_by, '4'),
    price_changed_by = COALESCE(price_changed_by, '4');