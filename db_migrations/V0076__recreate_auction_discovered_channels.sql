CREATE TABLE auction_discovered_channels (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL UNIQUE,
    title VARCHAR(255),
    username VARCHAR(255),
    is_admin BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO auction_discovered_channels (chat_id, title, username, is_admin, updated_at)
SELECT chat_id, title, username, is_admin, updated_at FROM auction_discovered_channels_old1;