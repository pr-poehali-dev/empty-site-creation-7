UPDATE receiving_items
SET factory_barcode = '4660077749941'
WHERE btrim(COALESCE(product_group,'')) = 'Ручной отпариватель'
  AND btrim(COALESCE(brand,'')) = 'Vixter'
  AND btrim(COALESCE(model,'')) = 'GSH-2300'
  AND COALESCE(factory_barcode,'') = '';