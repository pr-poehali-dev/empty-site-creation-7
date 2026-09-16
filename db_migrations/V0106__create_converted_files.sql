CREATE TABLE IF NOT EXISTS converted_files (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  size_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_converted_files_created ON converted_files (created_at DESC);