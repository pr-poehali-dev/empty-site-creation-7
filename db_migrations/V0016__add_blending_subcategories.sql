
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Блендеры стационарные', 1, ARRAY['блендер стационарный'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Блендеры погружные', 2, ARRAY['блендер погружной'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Миксеры ручные', 3, ARRAY['миксер ручной'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Миксеры планетарные', 4, ARRAY['миксер планетарный'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Кухонные комбайны', 5, ARRAY['кухонный комбайн'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Мясорубки электрические', 6, ARRAY['мясорубка электрическая', 'мясорубка'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Соковыжималки', 7, ARRAY['соковыжималка'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Шнековые соковыжималки', 8, ARRAY['шнековая соковыжималка'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Овощерезки и слайсеры', 9, ARRAY['овощерезка', 'слайсер'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Измельчители', 10, ARRAY['измельчитель'] FROM categories WHERE parent_id = 10 AND name = 'Измельчение и смешивание';
