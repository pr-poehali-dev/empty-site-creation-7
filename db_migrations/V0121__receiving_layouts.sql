CREATE TABLE receiving_layouts (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES receiving_suppliers(id),
  header_signature TEXT NOT NULL,
  mapping JSONB NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, header_signature)
);
