CREATE TABLE IF NOT EXISTS catalog_suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_suppliers_name ON catalog_suppliers (lower(name));

CREATE TABLE IF NOT EXISTS catalog_layouts (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    header_signature TEXT NOT NULL,
    mapping JSONB NOT NULL,
    price_mapping JSONB,
    excluded_categories JSONB,
    article_case TEXT,
    used_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_layouts_supplier ON catalog_layouts (supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_layouts_sig ON catalog_layouts (supplier_id, header_signature);

CREATE TABLE IF NOT EXISTS catalog_drafts (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER,
    file_name TEXT,
    stage TEXT NOT NULL DEFAULT 'parsed',
    mapping JSONB,
    price_mapping JSONB,
    excluded_categories JSONB,
    article_case TEXT,
    vat_rate TEXT,
    product_group TEXT,
    fill_mode TEXT NOT NULL DEFAULT 'empty_only',
    rows_data JSONB,
    rows_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_catalog_drafts_expires ON catalog_drafts (expires_at);