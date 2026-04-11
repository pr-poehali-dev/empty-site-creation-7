
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Мультиварки', 1, ARRAY['мультиварка'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Скороварки', 2, ARRAY['скороварка'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Микроволновые печи', 3, ARRAY['микроволновая печь', 'микроволновка', 'свч'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Аэрогрили', 4, ARRAY['аэрогриль'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Электрогрили и электрошашлычницы', 5, ARRAY['электрогриль', 'электрошашлычница'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Электроплитки настольные', 6, ARRAY['электроплитка настольная', 'электроплитка'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Индукционные плитки настольные', 7, ARRAY['индукционная плитка настольная', 'индукционная плитка'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Настольные духовки и мини-печи', 8, ARRAY['настольная духовка', 'мини-печь'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Фритюрницы', 9, ARRAY['фритюрница'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Бутербродницы и сэндвичницы', 10, ARRAY['бутербродница', 'сэндвичница'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Вафельницы', 11, ARRAY['вафельница'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Блинницы', 12, ARRAY['блинница'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Орешницы', 13, ARRAY['орешница'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Йогуртницы', 14, ARRAY['йогуртница'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Пароварки', 15, ARRAY['пароварка'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Рисоварки', 16, ARRAY['рисоварка'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Су-вид', 17, ARRAY['су-вид'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Пиццамейкеры', 18, ARRAY['пиццамейкер'] FROM categories WHERE parent_id = 10 AND name = 'Приготовление пищи';
