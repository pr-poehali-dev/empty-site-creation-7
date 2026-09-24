CREATE TABLE IF NOT EXISTS t_p69702834_empty_site_creation_.receiving_moves (
    id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL,
    warehouse_from TEXT,
    warehouse_to TEXT NOT NULL,
    moved_by INTEGER,
    moved_by_name TEXT,
    moved_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receiving_moves_item
    ON t_p69702834_empty_site_creation_.receiving_moves (item_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_receiving_moves_at
    ON t_p69702834_empty_site_creation_.receiving_moves (moved_at DESC);

CREATE INDEX IF NOT EXISTS idx_receiving_items_warehouse
    ON t_p69702834_empty_site_creation_.receiving_items (warehouse);