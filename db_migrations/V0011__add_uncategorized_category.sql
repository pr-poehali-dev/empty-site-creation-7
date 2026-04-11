INSERT INTO categories (parent_id, name, sort_order)
SELECT NULL, 'Без категории', 9999
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Без категории' AND parent_id IS NULL);