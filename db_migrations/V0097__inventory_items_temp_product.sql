ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS temp_product_id integer NULL REFERENCES temp_products(id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_temp_product
  ON inventory_items (temp_product_id);