ALTER TABLE wholesale_orders
ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private';

CREATE TABLE IF NOT EXISTS wholesale_order_shares (
    order_id INTEGER NOT NULL,
    manager_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_id, manager_id)
);

CREATE INDEX IF NOT EXISTS idx_wholesale_order_shares_manager ON wholesale_order_shares(manager_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_visibility ON wholesale_orders(visibility);