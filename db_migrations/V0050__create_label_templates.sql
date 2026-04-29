CREATE TABLE IF NOT EXISTS label_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  width_mm NUMERIC(6,2) NOT NULL DEFAULT 58,
  height_mm NUMERIC(6,2) NOT NULL DEFAULT 40,
  dpi INTEGER NOT NULL DEFAULT 203,
  rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_label_templates_name ON label_templates(name);
