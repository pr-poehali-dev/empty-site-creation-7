-- Возвраты от оптовиков
CREATE TABLE wholesale_returns (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(300) NOT NULL,
    comment TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES managers(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMP NULL
);
CREATE INDEX idx_wholesale_returns_status ON wholesale_returns(status);
CREATE INDEX idx_wholesale_returns_customer ON wholesale_returns(customer_name);
CREATE INDEX idx_wholesale_returns_created ON wholesale_returns(created_at DESC);

-- Позиции возврата
CREATE TABLE wholesale_return_items (
    id SERIAL PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES wholesale_returns(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    price NUMERIC(12, 2) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    temp_product_id INTEGER NULL,
    item_name TEXT NULL,
    from_bulk BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_wholesale_return_items_return ON wholesale_return_items(return_id);

-- Расширяем order_payments: новый метод return_offset + ссылка на возврат
ALTER TABLE order_payments DROP CONSTRAINT order_payments_method_check;
ALTER TABLE order_payments ADD CONSTRAINT order_payments_method_check
    CHECK (method IN ('cash', 'card_transfer', 'bank_account', 'return_offset'));
ALTER TABLE order_payments ADD COLUMN return_id INTEGER NULL REFERENCES wholesale_returns(id);
CREATE INDEX idx_order_payments_return ON order_payments(return_id);
