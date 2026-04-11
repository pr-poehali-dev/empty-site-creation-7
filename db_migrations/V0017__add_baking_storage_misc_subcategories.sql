
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Хлебопечки', 1, ARRAY['хлебопечка', 'хлебопечь'] FROM categories WHERE parent_id = 10 AND name = 'Выпечка и тесто';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Тестомесы', 2, ARRAY['тестомес'] FROM categories WHERE parent_id = 10 AND name = 'Выпечка и тесто';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Ростеры и тостеры', 3, ARRAY['ростер', 'тостер'] FROM categories WHERE parent_id = 10 AND name = 'Выпечка и тесто';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Миксеры для теста', 4, ARRAY['миксер для теста'] FROM categories WHERE parent_id = 10 AND name = 'Выпечка и тесто';

INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Сушилки для овощей и фруктов', 1, ARRAY['сушилка для овощей', 'сушилка для фруктов', 'дегидратор'] FROM categories WHERE parent_id = 10 AND name = 'Заготовки и хранение';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Вакууматоры', 2, ARRAY['вакууматор', 'вакуумный упаковщик'] FROM categories WHERE parent_id = 10 AND name = 'Заготовки и хранение';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Ломтерезки', 3, ARRAY['ломтерезка'] FROM categories WHERE parent_id = 10 AND name = 'Заготовки и хранение';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Электрические консерваторы', 4, ARRAY['электрический консерватор', 'закаточная машинка электрическая'] FROM categories WHERE parent_id = 10 AND name = 'Заготовки и хранение';

INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Кухонные весы', 1, ARRAY['кухонные весы', 'весы кухонные'] FROM categories WHERE parent_id = 10 AND name = 'Измерение и мелочи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Термометры кухонные', 2, ARRAY['термометр кухонный', 'термометр для мяса'] FROM categories WHERE parent_id = 10 AND name = 'Измерение и мелочи';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Таймеры', 3, ARRAY['таймер кухонный', 'таймер'] FROM categories WHERE parent_id = 10 AND name = 'Измерение и мелочи';

INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Измельчители пищевых отходов', 1, ARRAY['измельчитель пищевых отходов', 'диспоузер'] FROM categories WHERE parent_id = 10 AND name = 'Уборка и вода';
INSERT INTO categories (parent_id, name, sort_order, keywords)
SELECT id, 'Фильтры и диспенсеры для воды', 2, ARRAY['фильтр для воды электрический', 'диспенсер для воды'] FROM categories WHERE parent_id = 10 AND name = 'Уборка и вода';
