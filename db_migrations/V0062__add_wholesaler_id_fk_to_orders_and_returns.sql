ALTER TABLE wholesale_orders  ADD COLUMN IF NOT EXISTS wholesaler_id INT REFERENCES wholesalers(id);
ALTER TABLE wholesale_returns ADD COLUMN IF NOT EXISTS wholesaler_id INT REFERENCES wholesalers(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wholesalers_name_unique ON wholesalers(name);

INSERT INTO wholesalers (name)
  SELECT DISTINCT customer_name FROM wholesale_orders
  WHERE customer_name IS NOT NULL AND customer_name <> ''
  ON CONFLICT (name) DO NOTHING;

INSERT INTO wholesalers (name)
  SELECT DISTINCT customer_name FROM wholesale_returns
  WHERE customer_name IS NOT NULL AND customer_name <> ''
  ON CONFLICT (name) DO NOTHING;

UPDATE wholesale_orders  o SET wholesaler_id = w.id
  FROM wholesalers w
  WHERE o.customer_name = w.name AND o.wholesaler_id IS NULL;

UPDATE wholesale_returns r SET wholesaler_id = w.id
  FROM wholesalers w
  WHERE r.customer_name = w.name AND r.wholesaler_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_wholesale_orders_wholesaler_id  ON wholesale_orders(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_returns_wholesaler_id ON wholesale_returns(wholesaler_id);