CREATE TABLE model_market_prices (
  id SERIAL PRIMARY KEY,
  brand_key TEXT NOT NULL,
  model_key TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  wb_ru NUMERIC(14,2), wb_ru_status TEXT, wb_ru_at TIMESTAMP, wb_ru_title TEXT,
  mv_ru NUMERIC(14,2), mv_ru_status TEXT, mv_ru_at TIMESTAMP, mv_ru_title TEXT,
  wb_by NUMERIC(14,2), wb_by_status TEXT, wb_by_at TIMESTAMP, wb_by_title TEXT,
  total_ru NUMERIC(14,2), total_ru_manual BOOLEAN NOT NULL DEFAULT FALSE,
  total_by NUMERIC(14,2), total_by_manual BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (brand_key, model_key)
);