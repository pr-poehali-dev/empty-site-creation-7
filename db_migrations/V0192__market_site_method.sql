ALTER TABLE market_site_settings ADD COLUMN method TEXT NOT NULL DEFAULT 'proxy';
UPDATE market_site_settings SET method = 'browser' WHERE site IN ('wb_ru', 'wb_by', 'oz_ru', 'oz_by');
UPDATE market_site_settings SET method = 'proxy' WHERE site = 'ym_ru';
UPDATE market_site_settings SET method = 'direct' WHERE site = 'mv_ru';