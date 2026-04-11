
CREATE TABLE nomenclature_images (
    id SERIAL PRIMARY KEY,
    nomenclature_id INTEGER NOT NULL REFERENCES nomenclature(id),
    url VARCHAR(500) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nomenclature_images_nom ON nomenclature_images(nomenclature_id);
