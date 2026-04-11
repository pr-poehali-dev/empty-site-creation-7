
CREATE TABLE wholesale_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES wholesale_orders(id),
    nomenclature_id INTEGER NOT NULL REFERENCES nomenclature(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    price NUMERIC(12, 2) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL
);

CREATE INDEX idx_wholesale_order_items_order ON wholesale_order_items(order_id);
