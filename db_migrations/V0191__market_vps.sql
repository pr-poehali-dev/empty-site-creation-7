CREATE TABLE market_vps (
  id INTEGER PRIMARY KEY DEFAULT 1,
  host TEXT,
  port INTEGER,
  api_key TEXT,
  fingerprint TEXT,
  version TEXT,
  install_code_hash TEXT,
  install_code_expires TIMESTAMP,
  registered_at TIMESTAMP,
  last_ok_at TIMESTAMP,
  last_status TEXT,
  last_message TEXT,
  last_info TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO market_vps (id, install_code_hash, install_code_expires) VALUES
  (1, 'b9fcd2b07abcd37279426d1eeda55660b4be20e930d035895a1bc98576989df6', NOW() + INTERVAL '14 days');