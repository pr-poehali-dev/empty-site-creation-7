ALTER TABLE t_p69702834_empty_site_creation_.auction_lot_channels
    ADD CONSTRAINT auction_lot_channels_channel_id_fkey_new
    FOREIGN KEY (channel_id)
    REFERENCES t_p69702834_empty_site_creation_.auction_channels (id)
    NOT VALID;

ALTER TABLE t_p69702834_empty_site_creation_.auction_lot_channels
    VALIDATE CONSTRAINT auction_lot_channels_channel_id_fkey_new;