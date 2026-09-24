UPDATE t_p69702834_empty_site_creation_.receiving_items
SET check_result=NULL, warehouse=NULL, checked_at=NULL, checked_by=NULL,
    checked_by_name=NULL, daily_receiving_id=NULL, has_package=NULL,
    invoice_weight=NULL, factory_barcode=NULL
WHERE id IN (5, 6);

UPDATE t_p69702834_empty_site_creation_.daily_receivings
SET closed=true, closed_at=now()
WHERE id = 3;