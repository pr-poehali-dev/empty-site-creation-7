
ALTER TABLE products ADD COLUMN external_id VARCHAR(50) NULL;
CREATE UNIQUE INDEX idx_products_external_id ON products(external_id) WHERE external_id IS NOT NULL;

ALTER TABLE categories ADD COLUMN external_id VARCHAR(50) NULL;
CREATE UNIQUE INDEX idx_categories_external_id ON categories(external_id) WHERE external_id IS NOT NULL;
