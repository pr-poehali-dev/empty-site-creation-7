ALTER TABLE wholesale_order_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE wholesale_order_items SET sort_order = id WHERE sort_order = 0;
ALTER TABLE wholesale_order_items ADD COLUMN IF NOT EXISTS was_restored BOOLEAN NOT NULL DEFAULT false;
