
ALTER TABLE products ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX idx_products_is_archived ON products (is_archived);
