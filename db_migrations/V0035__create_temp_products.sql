CREATE TABLE IF NOT EXISTS t_p69702834_empty_site_creation_.temp_products (
  id SERIAL PRIMARY KEY,
  brand TEXT NOT NULL,
  article TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  nomenclature_id INTEGER,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
