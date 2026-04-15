CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (lower(name));
CREATE INDEX IF NOT EXISTS idx_products_brand_lower ON products (lower(brand));
CREATE INDEX IF NOT EXISTS idx_products_supplier_code_lower ON products (lower(supplier_code));
CREATE INDEX IF NOT EXISTS idx_products_product_group_lower ON products (lower(product_group));
CREATE INDEX IF NOT EXISTS idx_products_external_id ON products (external_id);