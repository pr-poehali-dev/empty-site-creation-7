ALTER TABLE catalog_drafts
  ADD COLUMN IF NOT EXISTS header_signature TEXT NULL;