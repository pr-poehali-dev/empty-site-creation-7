
ALTER TABLE nomenclature RENAME TO products;
ALTER SEQUENCE nomenclature_id_seq RENAME TO products_id_seq;
ALTER TABLE products RENAME CONSTRAINT nomenclature_pkey TO products_pkey;

ALTER TABLE nomenclature_images RENAME TO product_images;
ALTER TABLE product_images RENAME COLUMN nomenclature_id TO product_id;
ALTER SEQUENCE nomenclature_images_id_seq RENAME TO product_images_id_seq;
ALTER TABLE product_images RENAME CONSTRAINT nomenclature_images_pkey TO product_images_pkey;

ALTER TABLE nomenclature_barcodes RENAME TO product_barcodes;
ALTER TABLE product_barcodes RENAME COLUMN nomenclature_id TO product_id;
ALTER SEQUENCE nomenclature_barcodes_id_seq RENAME TO product_barcodes_id_seq;
ALTER TABLE product_barcodes RENAME CONSTRAINT nomenclature_barcodes_pkey TO product_barcodes_pkey;

ALTER TABLE wholesale_order_items RENAME COLUMN nomenclature_id TO product_id;
