CREATE TABLE IF NOT EXISTS position_codes (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL,
    product_group TEXT NOT NULL DEFAULT '',
    brand TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'import',
    created_by_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_position_codes ON position_codes (code, product_group, brand, model);
CREATE INDEX IF NOT EXISTS idx_position_codes_pos ON position_codes (product_group, brand, model);

INSERT INTO position_codes (code, product_group, brand, model, source)
SELECT DISTINCT btrim(factory_barcode), btrim(COALESCE(product_group,'')), btrim(COALESCE(brand,'')), btrim(COALESCE(model,'')), 'import'
FROM receiving_items
WHERE NULLIF(btrim(factory_barcode),'') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO position_codes (code, product_group, brand, model, source)
SELECT DISTINCT btrim(factory_barcode_2), btrim(COALESCE(product_group,'')), btrim(COALESCE(brand,'')), btrim(COALESCE(model,'')), 'import'
FROM receiving_items
WHERE NULLIF(btrim(factory_barcode_2),'') IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_receiving_items_pos ON receiving_items (btrim(COALESCE(product_group,'')), btrim(COALESCE(brand,'')), btrim(COALESCE(model,'')));

ALTER TABLE barcode_fixes ADD COLUMN IF NOT EXISTS from_pos JSONB NULL;
ALTER TABLE barcode_fixes ADD COLUMN IF NOT EXISTS to_pos JSONB NULL;
ALTER TABLE barcode_fixes ADD COLUMN IF NOT EXISTS cleared_ids JSONB NULL;

CREATE TABLE IF NOT EXISTS receiving_counterparties (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    inn TEXT NULL,
    phone TEXT NULL,
    contact TEXT NULL,
    comment TEXT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_by_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receiving_batches (
    id BIGSERIAL PRIMARY KEY,
    number TEXT NULL,
    day DATE NULL,
    seq INTEGER NULL,
    warehouse TEXT NULL,
    mixed BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'draft',
    counterparty_id INTEGER NULL,
    comment TEXT NULL,
    public_key TEXT NULL,
    created_by_user INTEGER NOT NULL,
    created_by_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ NULL,
    closed_by_name TEXT NULL,
    finished_at TIMESTAMPTZ NULL,
    finished_by_name TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_batches_number ON receiving_batches (number) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_batches_key ON receiving_batches (public_key) WHERE public_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_batches_day_seq ON receiving_batches (day, seq) WHERE day IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_batches_draft ON receiving_batches (created_by_user) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_receiving_batches_status ON receiving_batches (status);

CREATE TABLE IF NOT EXISTS receiving_batch_items (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'exact',
    active BOOLEAN NOT NULL DEFAULT true,
    added_by_name TEXT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_batch_items_active ON receiving_batch_items (item_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_receiving_batch_items_batch ON receiving_batch_items (batch_id);

CREATE TABLE IF NOT EXISTS receiving_batch_log (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    action TEXT NOT NULL,
    item_id BIGINT NULL,
    details JSONB NULL,
    by_user INTEGER NULL,
    by_name TEXT NOT NULL DEFAULT '',
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receiving_batch_log_batch ON receiving_batch_log (batch_id);