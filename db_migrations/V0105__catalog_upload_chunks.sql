CREATE TABLE IF NOT EXISTS catalog_upload_chunks (
    upload_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (upload_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_catalog_upload_chunks_created ON catalog_upload_chunks (created_at);