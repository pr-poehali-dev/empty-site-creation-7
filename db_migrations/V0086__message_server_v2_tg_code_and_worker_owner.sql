-- Сервер сообщений v2: код ответа Telegram + владелец воркера (механизм "новый гасит старого")

ALTER TABLE message_queue
  ADD COLUMN IF NOT EXISTS tg_code integer;

-- индекс для быстрого выбора очереди по порядку номеров среди созревших
CREATE INDEX IF NOT EXISTS idx_message_queue_pending_order
  ON message_queue (send_after, id)
  WHERE status = 'pending';

-- владелец замка: id текущего "главного" воркера. Новый воркер ставит свой id,
-- старый после каждого сообщения видит смену и тихо уступает эстафету.
ALTER TABLE message_worker_lock
  ADD COLUMN IF NOT EXISTS owner text;