CREATE TABLE IF NOT EXISTS receiving_work_events (
    id BIGSERIAL PRIMARY KEY,
    receiving_id INTEGER NOT NULL,
    manager_id INTEGER NULL,
    employee_name TEXT NOT NULL DEFAULT '',
    event TEXT NOT NULL,
    item_id BIGINT NULL,
    local_ts TIMESTAMP NULL,
    server_ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rwe_receiving ON receiving_work_events (receiving_id, event);
CREATE INDEX IF NOT EXISTS idx_rwe_item ON receiving_work_events (item_id);