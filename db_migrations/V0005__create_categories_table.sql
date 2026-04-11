
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    parent_id INTEGER REFERENCES categories(id),
    name VARCHAR(200) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO categories (id, parent_id, name, sort_order) VALUES (1, NULL, 'Бытовая техника', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (2, 1, 'Крупная бытовая техника', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (3, 1, 'Мелкая бытовая техника', 2);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (4, 2, 'Холодильники и морозильники', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (5, 2, 'Стиральные машины', 2);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (6, 2, 'Сушильные машины', 3);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (7, 2, 'Посудомоечные машины', 4);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (8, 2, 'Плиты и духовые шкафы', 5);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (9, 2, 'Вытяжки', 6);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (10, 3, 'Техника для кухни', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (11, 3, 'Уход за домом', 2);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (12, 3, 'Красота и здоровье', 3);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (13, NULL, 'Электроника', 2);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (14, 13, 'ТВ и видео', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (15, 13, 'Аудиотехника', 2);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (16, 13, 'Компьютерная техника', 3);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (17, 13, 'Гаджеты', 4);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (18, 14, 'Телевизоры', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (19, 14, 'Проекторы', 2);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (20, 14, 'Медиаплееры', 3);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (21, 15, 'Колонки и саундбары', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (22, 15, 'Наушники', 2);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (23, 16, 'Ноутбуки', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (24, 16, 'Мониторы', 2);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (25, 16, 'Комплектующие', 3);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (26, 17, 'Смартфоны и планшеты', 1);
INSERT INTO categories (id, parent_id, name, sort_order) VALUES (27, 17, 'Умный дом', 2);

SELECT setval('categories_id_seq', 27);
