
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Кофемашины', 1, ARRAY['кофемашина'] FROM categories WHERE parent_id = 10 AND name = 'Напитки';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Кофеварки', 2, ARRAY['кофеварка'] FROM categories WHERE parent_id = 10 AND name = 'Напитки';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Кофемолки', 3, ARRAY['кофемолка'] FROM categories WHERE parent_id = 10 AND name = 'Напитки';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Капучинаторы и вспениватели молока', 4, ARRAY['капучинатор', 'вспениватель молока'] FROM categories WHERE parent_id = 10 AND name = 'Напитки';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Электрочайники', 5, ARRAY['электрочайник', 'чайник электрический'] FROM categories WHERE parent_id = 10 AND name = 'Напитки';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Термопоты', 6, ARRAY['термопот'] FROM categories WHERE parent_id = 10 AND name = 'Напитки';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Чаеварки', 7, ARRAY['чаеварка'] FROM categories WHERE parent_id = 10 AND name = 'Напитки';
