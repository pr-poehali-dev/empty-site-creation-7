-- Отметить, что владельцу (позиция 1) уведомление о выигрыше по лоту 1 было доставлено
UPDATE auction_winners SET notified = true
WHERE lot_id = 1 AND position = 1;