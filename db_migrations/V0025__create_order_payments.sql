
CREATE TABLE order_payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES wholesale_orders(id),
    amount NUMERIC(14, 2) NOT NULL,
    method VARCHAR(30) NOT NULL CHECK (method IN ('cash', 'card_transfer', 'bank_account')),
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_payments_order ON order_payments(order_id);

ALTER TABLE wholesale_orders ADD COLUMN payment_status VARCHAR(30) NOT NULL DEFAULT 'not_paid';
ALTER TABLE wholesale_orders ADD COLUMN paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
