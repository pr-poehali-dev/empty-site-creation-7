
ALTER TABLE wholesale_orders ADD COLUMN previous_status VARCHAR(30);
ALTER TABLE wholesale_orders ADD COLUMN is_restored BOOLEAN NOT NULL DEFAULT false;
