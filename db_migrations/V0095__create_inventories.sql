-- Инвентаризации оптовиков. Без статусов: создал — заполняешь, всегда живая.
CREATE TABLE IF NOT EXISTS inventories (
    id SERIAL PRIMARY KEY,
    wholesaler_id INTEGER NOT NULL REFERENCES wholesalers(id),
    comment TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    -- Автор: либо оптовик/управленец из managers, либо владелец.
    created_by INTEGER,
    created_by_owner BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventories_wholesaler ON inventories(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_inventories_created_by ON inventories(created_by);

-- Позиции инвентаризации. Цена застывает в строке при добавлении.
CREATE TABLE IF NOT EXISTS inventory_items (
    id SERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES inventories(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    price NUMERIC NOT NULL DEFAULT 0,
    amount NUMERIC NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    -- Подписи: кто добавил, кто менял количество и цену.
    created_by VARCHAR(255),
    qty_changed_by VARCHAR(255),
    price_changed_by VARCHAR(255),
    -- Происхождение цены: 'rule' — правило из «Определения цен», 'card' — оптовая
    -- из карточки, 'manual' — правил владелец.
    price_is_manual BOOLEAN NOT NULL DEFAULT false,
    price_source VARCHAR(32),
    price_base_date TIMESTAMP,
    price_set_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_inventory ON inventory_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_product ON inventory_items(product_id);

-- Кому из управленцев видна инвентаризация. Настраивает только владелец.
CREATE TABLE IF NOT EXISTS inventory_shares (
    id SERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES inventories(id),
    manager_id INTEGER NOT NULL REFERENCES managers(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (inventory_id, manager_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_shares_inventory ON inventory_shares(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_shares_manager ON inventory_shares(manager_id);