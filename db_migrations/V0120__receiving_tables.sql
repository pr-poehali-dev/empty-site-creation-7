CREATE TABLE receiving_suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE receiving_uploads (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES receiving_suppliers(id),
  file_name TEXT NOT NULL,
  uploaded_by INTEGER,
  uploaded_by_name TEXT,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_added INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE receiving_items (
  id BIGSERIAL PRIMARY KEY,
  supplier_barcode TEXT NOT NULL UNIQUE,
  tech_name TEXT NOT NULL,
  serial_number TEXT,
  declared_defect TEXT,
  brand TEXT,
  model TEXT,
  product_group TEXT,
  direction TEXT,
  order_number TEXT,
  supplier_code TEXT,
  weight_gross NUMERIC(12,3),
  weight_net NUMERIC(12,3),
  volume NUMERIC(12,6),
  price NUMERIC(14,2),
  has_package BOOLEAN,
  invoice_weight NUMERIC(12,3),
  factory_barcode TEXT,
  factory_barcode_2 TEXT,
  check_result TEXT,
  defect_confirmed BOOLEAN,
  new_defect BOOLEAN,
  new_defect_text TEXT,
  checked_by INTEGER,
  checked_by_name TEXT,
  checked_at TIMESTAMP,
  daily_receiving_id INTEGER,
  warehouse TEXT,
  upload_id INTEGER REFERENCES receiving_uploads(id),
  supplier_id INTEGER REFERENCES receiving_suppliers(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_receiving_items_factory_barcode ON receiving_items(factory_barcode);
CREATE INDEX idx_receiving_items_order_number ON receiving_items(order_number);
CREATE INDEX idx_receiving_items_tech_name ON receiving_items(tech_name);
CREATE INDEX idx_receiving_items_warehouse ON receiving_items(warehouse);
CREATE INDEX idx_receiving_items_beauty ON receiving_items(product_group, brand, model);
CREATE INDEX idx_receiving_items_upload ON receiving_items(upload_id);
CREATE INDEX idx_receiving_items_checked_by ON receiving_items(checked_by, checked_at);

INSERT INTO receiving_suppliers (name) VALUES ('М-Видео');
