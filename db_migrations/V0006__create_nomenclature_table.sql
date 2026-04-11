
CREATE TABLE nomenclature (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name VARCHAR(300) NOT NULL,
    article VARCHAR(100),
    brand VARCHAR(150),
    supplier_code VARCHAR(100),
    price_base NUMERIC(12, 2),
    price_retail NUMERIC(12, 2),
    price_wholesale NUMERIC(12, 2),
    price_purchase NUMERIC(12, 2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nomenclature_category ON nomenclature(category_id);
CREATE INDEX idx_nomenclature_article ON nomenclature(article);
