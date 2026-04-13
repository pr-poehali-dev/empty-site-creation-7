CREATE TABLE IF NOT EXISTS wholesalers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO wholesalers (name)
SELECT DISTINCT customer_name FROM wholesale_orders WHERE customer_name IS NOT NULL AND customer_name != ''
ON CONFLICT (name) DO NOTHING;