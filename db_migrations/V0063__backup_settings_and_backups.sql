CREATE TABLE IF NOT EXISTS backup_settings (
    id SERIAL PRIMARY KEY,
    auto_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mode VARCHAR(16) NOT NULL DEFAULT 'daily',
    interval_minutes INTEGER NOT NULL DEFAULT 60,
    daily_every_days INTEGER NOT NULL DEFAULT 1,
    daily_time VARCHAR(5) NOT NULL DEFAULT '03:00',
    timezone VARCHAR(32) NOT NULL DEFAULT 'Europe/Moscow',
    retention_days INTEGER NOT NULL DEFAULT 30,
    retention_count INTEGER NOT NULL DEFAULT 30,
    function_timeout_sec INTEGER NOT NULL DEFAULT 60,
    last_backup_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO backup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS backups (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    s3_key VARCHAR(512),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    tables_count INTEGER NOT NULL DEFAULT 0,
    rows_count BIGINT NOT NULL DEFAULT 0,
    type VARCHAR(16) NOT NULL DEFAULT 'manual',
    is_protected BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'success',
    error_message TEXT,
    checksum VARCHAR(64),
    duration_sec NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_type_protected ON backups (type, is_protected);