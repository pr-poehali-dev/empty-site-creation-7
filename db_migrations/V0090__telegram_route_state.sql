CREATE TABLE IF NOT EXISTS tg_route_state (
    route TEXT PRIMARY KEY,
    ok BOOLEAN NOT NULL DEFAULT TRUE,
    failed_at TIMESTAMP,
    last_success_at TIMESTAMP,
    fail_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);