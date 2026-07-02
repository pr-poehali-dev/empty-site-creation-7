-- Аукционная роль у управленцев (модалка сотрудника работает с managers)
ALTER TABLE managers
  ADD COLUMN IF NOT EXISTS auction_role VARCHAR(16) NOT NULL DEFAULT 'none';
