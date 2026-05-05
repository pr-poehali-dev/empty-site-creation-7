-- Single-user lock для заявок
-- Поля для отслеживания кто и в какой сессии открыл заявку для редактирования

ALTER TABLE wholesale_orders
ADD COLUMN locked_by_user_id INTEGER NULL REFERENCES managers(id),
ADD COLUMN locked_at TIMESTAMP NULL,
ADD COLUMN locked_session_id TEXT NULL;

CREATE INDEX idx_wholesale_orders_locked_by_user_id ON wholesale_orders(locked_by_user_id);
CREATE INDEX idx_wholesale_orders_locked_at ON wholesale_orders(locked_at);

-- Лог захватов и освобождений блокировки для разбора инцидентов
CREATE TABLE order_lock_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES wholesale_orders(id),
  user_id INTEGER NOT NULL REFERENCES managers(id),
  session_id TEXT NOT NULL,
  action VARCHAR(30) NOT NULL,
  reason VARCHAR(50) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_lock_history_order_id ON order_lock_history(order_id);
CREATE INDEX idx_order_lock_history_user_id ON order_lock_history(user_id);
