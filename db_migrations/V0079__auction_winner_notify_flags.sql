-- Этап 5.1: доставка уведомлений победителям
-- Отправлено ли победителю сообщение о выигрыше (false = бот не смог написать)
ALTER TABLE auction_winners ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT false;

-- Отправлено ли напоминание "осталось 5 минут" (чтобы не слать повторно)
ALTER TABLE auction_winners ADD COLUMN IF NOT EXISTS reminded BOOLEAN NOT NULL DEFAULT false;