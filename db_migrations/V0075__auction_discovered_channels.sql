CREATE TABLE IF NOT EXISTS auction_discovered_channels (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL UNIQUE,
    title VARCHAR(255),
    username VARCHAR(255),
    is_admin BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);