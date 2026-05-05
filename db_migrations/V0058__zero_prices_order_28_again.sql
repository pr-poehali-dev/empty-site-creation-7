UPDATE wholesale_order_items SET price = 0, amount = 0 WHERE order_id = 28;
UPDATE wholesale_orders SET total_amount = 0, updated_at = NOW() WHERE id = 28;