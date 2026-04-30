CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by INTEGER
);

INSERT INTO app_settings (key, value) VALUES ('lock_non_new_orders', 'false')
ON CONFLICT (key) DO NOTHING;