-- Журнал исправлений заводских штрихкодов.
-- Мастера вводили коды вручную и ошибались в 1–3 цифрах. Замену делает любой
-- сотрудник, откатывает владелец. Номера единиц храним, чтобы откат вернул
-- старый код ровно тем, кому его меняли.

CREATE TABLE IF NOT EXISTS barcode_fixes (
    id BIGSERIAL PRIMARY KEY,
    old_code TEXT NOT NULL,
    new_code TEXT NOT NULL,
    units INTEGER NOT NULL DEFAULT 0,
    item_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL DEFAULT 'similar',
    fixed_by INTEGER,
    fixed_by_name TEXT,
    fixed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reverted_at TIMESTAMPTZ,
    reverted_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_barcode_fixes_at ON barcode_fixes (fixed_at DESC);
CREATE INDEX IF NOT EXISTS idx_receiving_items_factory ON receiving_items (btrim(factory_barcode));