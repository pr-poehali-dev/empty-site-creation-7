CREATE TABLE IF NOT EXISTS receiving_fixes (
    id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL,
    stage TEXT NOT NULL,
    was TEXT NULL,
    became TEXT NULL,
    receiving_id INTEGER NULL,
    fixed_by INTEGER NULL,
    fixed_by_name TEXT NOT NULL DEFAULT '',
    local_ts TIMESTAMP NULL,
    server_ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receiving_fixes_item ON receiving_fixes (item_id);
ALTER TABLE receiving_items ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ NULL;
ALTER TABLE receiving_items ADD COLUMN IF NOT EXISTS fixed_local TIMESTAMP NULL;
ALTER TABLE receiving_items ADD COLUMN IF NOT EXISTS fixed_by_name TEXT NULL;
ALTER TABLE receiving_items ADD COLUMN IF NOT EXISTS wipe_fixed_at TIMESTAMPTZ NULL;