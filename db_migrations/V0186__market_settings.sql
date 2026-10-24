ALTER TABLE model_market_prices
  ADD COLUMN oz_ru NUMERIC(14,2), ADD COLUMN oz_ru_status TEXT, ADD COLUMN oz_ru_at TIMESTAMP, ADD COLUMN oz_ru_title TEXT,
  ADD COLUMN ym_ru NUMERIC(14,2), ADD COLUMN ym_ru_status TEXT, ADD COLUMN ym_ru_at TIMESTAMP, ADD COLUMN ym_ru_title TEXT,
  ADD COLUMN oz_by NUMERIC(14,2), ADD COLUMN oz_by_status TEXT, ADD COLUMN oz_by_at TIMESTAMP, ADD COLUMN oz_by_title TEXT;

CREATE TABLE market_proxy_settings (
  provider TEXT PRIMARY KEY,
  api_key TEXT,
  package_id INTEGER,
  proxy_ru TEXT,
  proxy_ru_id INTEGER,
  proxy_by TEXT,
  proxy_by_id INTEGER,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE market_site_settings (
  site TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  via_proxy BOOLEAN NOT NULL DEFAULT TRUE,
  test_brand TEXT NOT NULL DEFAULT 'Blackton',
  test_model TEXT NOT NULL DEFAULT 'TP536',
  last_status TEXT,
  last_message TEXT,
  last_price NUMERIC(14,2),
  last_title TEXT,
  last_at TIMESTAMP
);

INSERT INTO market_site_settings (site, via_proxy) VALUES
  ('wb_ru', TRUE), ('oz_ru', TRUE), ('ym_ru', TRUE), ('mv_ru', FALSE), ('wb_by', TRUE), ('oz_by', TRUE);