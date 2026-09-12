DROP INDEX IF EXISTS idx_products_article_norm;
DROP INDEX IF EXISTS idx_temp_products_article_norm;

CREATE INDEX idx_products_article_norm
  ON products (translate(upper(article), 'АВЕКМНОРСТУХ №', 'ABEKMHOPCTYX'));

CREATE INDEX idx_temp_products_article_norm
  ON temp_products (translate(upper(article), 'АВЕКМНОРСТУХ №', 'ABEKMHOPCTYX'));