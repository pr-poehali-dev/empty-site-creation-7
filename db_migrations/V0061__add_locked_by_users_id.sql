-- Привязка блокировки к users.id вместо managers.id
-- Владелец проекта (role='owner') не имеет записи в managers, но имеет уникальный users.id

ALTER TABLE wholesale_orders
ADD COLUMN locked_by_users_id INTEGER NULL REFERENCES users(id);

CREATE INDEX idx_wholesale_orders_locked_by_users_id ON wholesale_orders(locked_by_users_id);
