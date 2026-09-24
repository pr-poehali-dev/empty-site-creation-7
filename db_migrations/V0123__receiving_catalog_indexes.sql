CREATE INDEX IF NOT EXISTS idx_recv_items_gbm
ON receiving_items (
  (COALESCE(NULLIF(btrim(product_group), ''), '')),
  (COALESCE(NULLIF(btrim(brand), ''), '')),
  (COALESCE(NULLIF(btrim(model), ''), ''))
);

CREATE INDEX IF NOT EXISTS idx_recv_items_direction ON receiving_items (direction);
CREATE INDEX IF NOT EXISTS idx_recv_items_brand ON receiving_items (brand);
CREATE INDEX IF NOT EXISTS idx_recv_items_order_number ON receiving_items (order_number);
