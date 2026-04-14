CREATE TABLE IF NOT EXISTS t_p69702834_empty_site_creation_.new_barcodes (
  id SERIAL PRIMARY KEY,
  barcode TEXT NOT NULL,
  nomenclature_id INTEGER,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  is_removed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
