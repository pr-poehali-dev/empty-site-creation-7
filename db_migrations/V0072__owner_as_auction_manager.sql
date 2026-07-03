INSERT INTO managers (phone, telegram_chat_id, first_name, auction_role, status)
SELECT '+79606488639', 1529375723, 'Владелец', 'admin', 'authorized'
WHERE NOT EXISTS (
  SELECT 1 FROM managers WHERE phone = '+79606488639'
);

UPDATE managers
SET telegram_chat_id = 1529375723, auction_role = 'admin', status = 'authorized'
WHERE phone = '+79606488639';