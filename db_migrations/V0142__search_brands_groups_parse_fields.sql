CREATE TABLE IF NOT EXISTS search_brands (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    aliases TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS search_group_id INTEGER REFERENCES search_groups(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_brand_id INTEGER REFERENCES search_brands(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS feature TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS parse_status TEXT NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_products_search_brand ON products (search_brand_id);
CREATE INDEX IF NOT EXISTS idx_products_search_group ON products (search_group_id);
CREATE INDEX IF NOT EXISTS idx_products_parse_status ON products (parse_status);

INSERT INTO search_brands (name, aliases) VALUES ('MAUNFELD', ARRAY['MAUNFELD','Maunfeld','maunfeld','МАУНФЕЛД','Маунфелд','маунфелд','MAUNFELD Бай']) ON CONFLICT (name) DO NOTHING;