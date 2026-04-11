
CREATE TABLE managers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    telegram_chat_id BIGINT,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role_id INTEGER REFERENCES roles(id),
    status VARCHAR(20) NOT NULL DEFAULT 'not_authorized',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_managers_phone ON managers(phone);
CREATE INDEX idx_managers_status ON managers(status);

UPDATE roles SET name = 'Управляющий', description = 'Полный доступ к управлению' WHERE id = 1;
UPDATE roles SET name = 'Менеджер опта', description = 'Управление оптовыми заказами' WHERE id = 2;
UPDATE roles SET name = 'Менеджер розницы', description = 'Управление розничными заказами' WHERE id = 3;
UPDATE roles SET name = 'Продавец', description = 'Работа с продажами' WHERE id = 4;
