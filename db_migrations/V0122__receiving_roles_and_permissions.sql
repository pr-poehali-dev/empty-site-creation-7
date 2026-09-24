INSERT INTO roles (name, description) VALUES
  ('Мастер', 'Проверка товара при приёмке'),
  ('Протирка', 'Чистка товара перед продажей');

CREATE TABLE receiving_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER REFERENCES roles(id),
  manager_id INTEGER REFERENCES managers(id),
  perm_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CHECK ((role_id IS NULL) <> (manager_id IS NULL))
);

CREATE UNIQUE INDEX idx_recperm_role ON receiving_permissions(role_id, perm_key) WHERE role_id IS NOT NULL;
CREATE UNIQUE INDEX idx_recperm_manager ON receiving_permissions(manager_id, perm_key) WHERE manager_id IS NOT NULL;
