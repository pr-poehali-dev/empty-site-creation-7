CREATE INDEX IF NOT EXISTS idx_products_article_norm
  ON products (translate(upper(article), 'АВЕКМНОРСТУХ -._/№', 'ABEKMHOPCTYX'));

CREATE INDEX IF NOT EXISTS idx_temp_products_article_norm
  ON temp_products (translate(upper(article), 'АВЕКМНОРСТУХ -._/№', 'ABEKMHOPCTYX'));