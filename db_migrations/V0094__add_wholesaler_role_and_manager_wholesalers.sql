-- Должность «Оптовик»: прав ноль, названия нет ни в одном списке доступа.
INSERT INTO roles (name, description)
SELECT 'Оптовик', 'Внешний пользователь — доступ к своим фирмам'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Оптовик');

-- Связь «пользователь — фирмы»: у одного оптовика может быть несколько фирм,
-- одна фирма может быть у нескольких людей.
CREATE TABLE IF NOT EXISTS manager_wholesalers (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL REFERENCES managers(id),
    wholesaler_id INTEGER NOT NULL REFERENCES wholesalers(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (manager_id, wholesaler_id)
);

CREATE INDEX IF NOT EXISTS idx_manager_wholesalers_manager ON manager_wholesalers(manager_id);
CREATE INDEX IF NOT EXISTS idx_manager_wholesalers_wholesaler ON manager_wholesalers(wholesaler_id);