CREATE TABLE IF NOT EXISTS invoice_suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_suppliers_name ON invoice_suppliers (lower(name));

CREATE TABLE IF NOT EXISTS invoice_layouts (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    header_signature TEXT NOT NULL,
    mapping JSONB NOT NULL,
    used_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_layouts_supplier ON invoice_layouts (supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_layouts_sig ON invoice_layouts (supplier_id, header_signature);

CREATE TABLE IF NOT EXISTS invoice_drafts (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER,
    file_name TEXT,
    stage TEXT NOT NULL DEFAULT 'parsed',
    mapping JSONB,
    rows_data JSONB,
    rows_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_invoice_drafts_expires ON invoice_drafts (expires_at);