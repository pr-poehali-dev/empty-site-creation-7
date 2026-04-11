
-- Холодильники и морозильники (parent_id=4)
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (4, 'Холодильники двухкамерные', 1, ARRAY['холодильник двухкамерный', 'холодильник']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (4, 'Холодильники однокамерные', 2, ARRAY['холодильник однокамерный']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (4, 'Холодильники Side-by-Side', 3, ARRAY['холодильник side-by-side']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (4, 'Холодильники French Door', 4, ARRAY['холодильник french door']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (4, 'Морозильные камеры', 5, ARRAY['морозильная камера', 'морозильник']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (4, 'Морозильные лари', 6, ARRAY['морозильный ларь']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (4, 'Винные шкафы', 7, ARRAY['винный шкаф']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (4, 'Мини-холодильники', 8, ARRAY['мини-холодильник', 'мини холодильник']);

-- Стиральные машины (parent_id=5)
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (5, 'Стиральные машины фронтальные', 1, ARRAY['стиральная машина фронтальная', 'стиральная машина']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (5, 'Стиральные машины вертикальные', 2, ARRAY['стиральная машина вертикальная']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (5, 'Стирально-сушильные машины', 3, ARRAY['стирально-сушильная машина']);

-- Сушильные машины (id=6) — keywords на саму категорию
UPDATE categories SET keywords = ARRAY['сушильная машина'] WHERE id = 6;

-- Посудомоечные машины (parent_id=7)
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (7, 'Посудомоечные машины полноразмерные (60 см)', 1, ARRAY['посудомоечная машина']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (7, 'Посудомоечные машины узкие (45 см)', 2, ARRAY['посудомоечная машина узкая']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (7, 'Посудомоечные машины настольные', 3, ARRAY['посудомоечная машина настольная', 'посудомоечная машина компактная', 'посудомойка']);

-- Плиты и духовые шкафы (parent_id=8)
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (8, 'Газовые плиты', 1, ARRAY['газовая плита']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (8, 'Электрические плиты', 2, ARRAY['электрическая плита', 'электроплита']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (8, 'Комбинированные плиты', 3, ARRAY['комбинированная плита']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (8, 'Варочные панели газовые', 4, ARRAY['варочная панель газовая']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (8, 'Варочные панели электрические', 5, ARRAY['варочная панель электрическая']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (8, 'Варочные панели индукционные', 6, ARRAY['варочная панель индукционная', 'индукционная панель']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (8, 'Духовые шкафы электрические', 7, ARRAY['духовой шкаф электрический', 'духовой шкаф']);
INSERT INTO categories (parent_id, name, sort_order, keywords) VALUES (8, 'Духовые шкафы газовые', 8, ARRAY['духовой шкаф газовый']);

-- Вытяжки (id=9) — keywords на саму категорию
UPDATE categories SET keywords = ARRAY['вытяжка кухонная', 'вытяжка'] WHERE id = 9;
