CREATE TABLE IF NOT EXISTS t_p69702834_empty_site_creation_.price_sets (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  source_id INTEGER NULL,
  rate_by_per_100_rub NUMERIC(10,4) NULL,
  created_by INTEGER NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_sets_source ON t_p69702834_empty_site_creation_.price_sets(source_type, source_id);

CREATE TABLE IF NOT EXISTS t_p69702834_empty_site_creation_.price_set_items (
  id SERIAL PRIMARY KEY,
  set_id INTEGER NOT NULL,
  product_id INTEGER NULL,
  temp_product_id INTEGER NULL,
  name TEXT NULL,
  quantity NUMERIC(14,3) NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  brand TEXT NULL,
  model TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_set_items_set ON t_p69702834_empty_site_creation_.price_set_items(set_id);

CREATE TABLE IF NOT EXISTS t_p69702834_empty_site_creation_.market_price_history (
  id SERIAL PRIMARY KEY,
  brand_key TEXT NOT NULL,
  model_key TEXT NOT NULL,
  site VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL,
  price NUMERIC(14,2) NULL,
  title TEXT NULL,
  url TEXT NULL,
  user_id INTEGER NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_price_history_model ON t_p69702834_empty_site_creation_.market_price_history(brand_key, model_key, site);