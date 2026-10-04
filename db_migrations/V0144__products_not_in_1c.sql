ALTER TABLE products ADD COLUMN IF NOT EXISTS not_in_1c BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_from_draft_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_products_not_in_1c ON products (not_in_1c) WHERE not_in_1c = true;
CREATE INDEX IF NOT EXISTS idx_products_created_from_draft ON products (created_from_draft_id) WHERE created_from_draft_id IS NOT NULL;