ALTER TABLE invoice_drafts ADD COLUMN IF NOT EXISTS match_mode TEXT NOT NULL DEFAULT 'article';
ALTER TABLE invoice_drafts ADD COLUMN IF NOT EXISTS search_brand_id INTEGER;