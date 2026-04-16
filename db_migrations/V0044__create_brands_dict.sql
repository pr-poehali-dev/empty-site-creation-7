CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);

INSERT INTO brands (name)
SELECT DISTINCT brand FROM products
WHERE brand IS NOT NULL AND brand != ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO brands (name)
SELECT DISTINCT brand FROM temp_products
WHERE brand IS NOT NULL AND brand != ''
ON CONFLICT (name) DO NOTHING;