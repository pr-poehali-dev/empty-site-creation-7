-- Удаляем устаревший внешний ключ auction_lot_channels.channel_id -> auction_channels_old1(id).
-- Он остался от старой миграции и конфликтует с актуальным ключом ..._fkey_new,
-- вызывая "foreign key constraint violation" при публикации лота в каналы.
-- Актуальный ключ auction_lot_channels_channel_id_fkey_new (-> auction_channels.id) сохраняется.
ALTER TABLE auction_lot_channels DROP CONSTRAINT IF EXISTS auction_lot_channels_channel_id_fkey;