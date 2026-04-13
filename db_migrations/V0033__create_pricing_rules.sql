
CREATE TABLE pricing_rules (
    id SERIAL PRIMARY KEY,
    wholesaler_id INTEGER NOT NULL REFERENCES wholesalers(id),
    priority INTEGER NOT NULL DEFAULT 0,
    filter_type VARCHAR(50) NOT NULL DEFAULT 'product_group',
    filter_value VARCHAR(255) NOT NULL,
    price_field VARCHAR(50) NOT NULL DEFAULT 'price_base',
    formula VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pricing_rules_wholesaler ON pricing_rules(wholesaler_id);
