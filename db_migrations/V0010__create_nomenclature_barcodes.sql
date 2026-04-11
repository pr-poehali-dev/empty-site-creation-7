
CREATE TABLE nomenclature_barcodes (
    id SERIAL PRIMARY KEY,
    nomenclature_id INTEGER NOT NULL REFERENCES nomenclature(id),
    barcode VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nomenclature_barcodes_nom ON nomenclature_barcodes(nomenclature_id);
CREATE INDEX idx_nomenclature_barcodes_code ON nomenclature_barcodes(barcode);
