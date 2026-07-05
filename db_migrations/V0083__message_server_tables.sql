-- Сервер сообщений: очередь заданий
CREATE TABLE IF NOT EXISTS message_queue (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(30) NOT NULL DEFAULT 'telegram',
    address TEXT NOT NULL,                 -- chat_id получателя (или адрес канала)
    text TEXT NOT NULL DEFAULT '',
    button_text VARCHAR(200),              -- необязательная кнопка-ссылка
    button_url TEXT,
    parse_mode VARCHAR(20) DEFAULT 'HTML',
    send_after TIMESTAMP NOT NULL DEFAULT now(),  -- отправить не раньше этого времени
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / sent / error / cancelled
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER,                  -- если NULL — берём из настроек
    last_error TEXT,
    dedup_key VARCHAR(200),                -- защита от дублей
    report_url TEXT,                       -- куда отписаться о результате (необязательно)
    reported BOOLEAN NOT NULL DEFAULT false,
    source VARCHAR(100),                   -- какая функция создала задание (для монитора)
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    sent_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_queue_dedup
    ON message_queue(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_queue_pending
    ON message_queue(status, send_after);

-- Сервер сообщений: настройки (ключ-значение, как app_settings)
CREATE TABLE IF NOT EXISTS message_settings (
    key VARCHAR(60) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT now()
);

INSERT INTO message_settings (key, value) VALUES
    ('rate_per_second', '25'),        -- сообщений в секунду
    ('max_attempts', '3'),            -- сколько раз повторять при сбое
    ('retry_pause_seconds', '10'),    -- пауза перед повтором
    ('per_user_per_minute', '20'),    -- не больше N одному человеку в минуту
    ('enabled', 'true')               -- стоп-кран (вкл/выкл рассылку)
ON CONFLICT (key) DO NOTHING;
