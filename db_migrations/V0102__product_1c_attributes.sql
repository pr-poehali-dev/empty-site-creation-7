ALTER TABLE products
  ADD COLUMN IF NOT EXISTS nomenclature_kind varchar(100) NOT NULL DEFAULT 'Товары',
  ADD COLUMN IF NOT EXISTS nomenclature_type varchar(100) NOT NULL DEFAULT 'Запас',
  ADD COLUMN IF NOT EXISTS writeoff_method varchar(50) NOT NULL DEFAULT 'FIFO',
  ADD COLUMN IF NOT EXISTS unit varchar(50) NOT NULL DEFAULT 'шт',
  ADD COLUMN IF NOT EXISTS vat_rate varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS weight_gross numeric(12,3) NULL,
  ADD COLUMN IF NOT EXISTS weight_net numeric(12,3) NULL,
  ADD COLUMN IF NOT EXISTS tnved_code varchar(30) NULL;