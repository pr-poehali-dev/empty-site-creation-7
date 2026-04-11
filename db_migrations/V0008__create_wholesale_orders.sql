
CREATE TABLE wholesale_orders (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(300) NOT NULL,
    comment TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'new',
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES managers(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wholesale_orders_status ON wholesale_orders(status);
CREATE INDEX idx_wholesale_orders_created ON wholesale_orders(created_at DESC);
