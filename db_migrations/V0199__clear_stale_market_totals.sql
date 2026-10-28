UPDATE model_market_prices SET total_ru = NULL, updated_at = NOW()
WHERE total_ru IS NOT NULL AND total_ru_manual = FALSE
  AND wb_ru IS NULL AND oz_ru IS NULL AND ym_ru IS NULL AND mv_ru IS NULL;

UPDATE model_market_prices SET total_by = NULL, updated_at = NOW()
WHERE total_by IS NOT NULL AND total_by_manual = FALSE
  AND wb_by IS NULL AND oz_by IS NULL;