CREATE TABLE IF NOT EXISTS message_worker_lock (
    id smallint PRIMARY KEY DEFAULT 1,
    locked_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT only_one_lock CHECK (id = 1)
);
INSERT INTO message_worker_lock (id, locked_at)
VALUES (1, now() - interval '1 hour')
ON CONFLICT (id) DO NOTHING;