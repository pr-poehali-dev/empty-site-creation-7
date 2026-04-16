ALTER TABLE pricing_rules
ADD COLUMN condition_price_field VARCHAR(50) DEFAULT NULL,
ADD COLUMN condition_operator VARCHAR(10) DEFAULT NULL,
ADD COLUMN condition_value NUMERIC(12, 2) DEFAULT NULL;